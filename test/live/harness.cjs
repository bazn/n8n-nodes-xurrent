// Minimal n8n runtime stub to exercise the compiled Xurrent nodes against a live account.
// Configure with XURRENT_TOKEN plus XURRENT_ACCOUNT and XURRENT_ENVIRONMENT (API host, e.g. api.xurrent-demo.com),
// or with xurrent_host (the Xurrent UI URL, e.g. https://widget.xurrent-demo.com) and xurrent_token in .env.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { Xurrent } = require(path.join(ROOT, 'dist/nodes/Xurrent/Xurrent.node.js'));
const { XurrentTrigger } = require(path.join(ROOT, 'dist/nodes/XurrentTrigger/XurrentTrigger.node.js'));

/** Derives account and API host from a UI URL: https://widget.4me-demo.com → widget, api.xurrent-demo.com */
function fromUiUrl(url) {
	if (!url) return {};
	const host = new URL(url).host;
	const [account, ...domain] = host.split('.');
	const apiDomain = domain.join('.').replace(/^4me-demo\.com$/, 'xurrent-demo.com').replace(/^4me\./, 'xurrent.');
	return { account, environment: `api.${apiDomain}` };
}

const derived = fromUiUrl(process.env.xurrent_host);
const credentials = {
	environment: process.env.XURRENT_ENVIRONMENT || derived.environment,
	account: process.env.XURRENT_ACCOUNT || process.env.xurrent_account || derived.account,
	token: process.env.XURRENT_TOKEN || process.env.xurrent_token,
	language: process.env.XURRENT_LANGUAGE || '',
};
if (!credentials.environment || !credentials.account || !credentials.token) {
	console.error('Set XURRENT_TOKEN, XURRENT_ACCOUNT and XURRENT_ENVIRONMENT (or xurrent_host/xurrent_token in .env).');
	process.exit(2);
}

async function httpRequest(options) {
	const url = new URL(options.url);
	for (const [k, v] of Object.entries(options.qs || {})) if (v !== undefined) url.searchParams.set(k, String(v));
	const headers = { ...(options.headers || {}) };
	let body;
	if (options.body instanceof FormData || Buffer.isBuffer(options.body) || typeof options.body === 'string') {
		body = options.body;
	} else if (options.body !== undefined) {
		body = JSON.stringify(options.body);
		headers['content-type'] = 'application/json';
	}
	const res = await fetch(url, { method: options.method || 'GET', headers, body });
	const responseHeaders = Object.fromEntries(res.headers.entries());
	let parsed;
	if (options.encoding === 'arraybuffer' && res.status < 400) {
		parsed = Buffer.from(await res.arrayBuffer());
	} else {
		const text = await res.text();
		parsed = text;
		try { parsed = text ? JSON.parse(text) : ''; } catch {}
	}
	if (res.status >= 400) {
		const err = new Error(`Request failed with status code ${res.status}`);
		err.httpCode = String(res.status);
		err.response = { body: parsed, status: res.status };
		throw err;
	}
	return options.returnFullResponse ? { body: parsed, headers: responseHeaders, statusCode: res.status } : parsed;
}

// Optional separate token for the webhook lifecycle (XURRENT_TRIGGER_TOKEN).
const triggerToken = process.env.XURRENT_TRIGGER_TOKEN;
let activeToken;

let requestLog = [];
async function httpRequestWithAuthentication(_name, options) {
	requestLog.push(`${options.method} ${options.url.replace(/^https:\/\/[^/]+\/v1\//, '')}`);
	return httpRequest({
		...options,
		headers: {
			...(options.headers || {}),
			Authorization: `Bearer ${activeToken || credentials.token}`,
			'X-Xurrent-Account': credentials.account,
		},
	});
}

const node = { name: 'Xurrent', type: '@bazulu1/n8n-nodes-xurrent.xurrent', typeVersion: 1, parameters: {} };
const logger = { debug() {}, info() {}, warn() {}, error() {} };

function baseContext(params, extra = {}) {
	return {
		getNode: () => node,
		logger,
		getTimezone: () => 'Europe/Zurich',
		getCredentials: async () => credentials,
		getNodeParameter(name, itemIndex, fallback, opts) {
			if (typeof itemIndex !== 'number') { opts = fallback; fallback = itemIndex; }
			const nested = name.split('.').reduce((obj, key) => (obj && typeof obj === 'object' ? obj[key] : undefined), params);
			let v = nested !== undefined ? nested : fallback;
			if (v === undefined) throw new Error(`Missing parameter ${name}`);
			if (opts && opts.extractValue && v && typeof v === 'object' && '__rl' in v) v = v.value;
			return v;
		},
		continueOnFail: () => false,
		getInputData: () => [{ json: {}, ...(extra.binary ? { binary: extra.binary } : {}) }],
		helpers: {
			assertBinaryData: (_i, name) => {
				const data = extra.binary && extra.binary[name];
				if (!data) throw new Error(`No binary data in field "${name}"`);
				return data;
			},
			getBinaryDataBuffer: async (_i, name) => Buffer.from(extra.binary[name].data, 'base64'),
			prepareBinaryData: async (buffer, fileName, mimeType) => ({
				data: buffer.toString('base64'),
				fileName,
				mimeType,
				fileSize: String(buffer.length),
			}),
			httpRequest,
			httpRequestWithAuthentication,
			returnJsonArray: (d) => (Array.isArray(d) ? d : [d]).map((json) => ({ json })),
			constructExecutionMetaData: (items, { itemData }) => items.map((i) => ({ ...i, pairedItem: itemData })),
		},
		...Object.fromEntries(Object.entries(extra).filter(([k]) => !['binary', 'raw'].includes(k))),
	};
}

async function run(params, extra = {}) {
	requestLog = [];
	const out = await new Xurrent().execute.call(baseContext({ authentication: 'accessToken', ...params }, extra));
	return out[0].map((i) => (extra.raw ? i : i.json));
}

async function method(kind, name, filter, paginationToken) {
	requestLog = [];
	const ctx = baseContext({ authentication: 'accessToken' });
	ctx.getNodeParameter = (n, fallback) => (n === 'authentication' ? 'accessToken' : fallback);
	return new Xurrent().methods[kind][name].call(ctx, filter, paginationToken);
}

/** Hook and webhook contexts take parameters without an item index: (name, fallback). */
function triggerContext(params, staticData, extra = {}) {
	const ctx = baseContext({ authentication: 'accessToken', ...params }, extra);
	const byItem = ctx.getNodeParameter;
	ctx.getNodeParameter = (name, fallback, opts) => byItem(name, 0, fallback, opts);
	ctx.getWorkflowStaticData = () => staticData;
	ctx.getWorkflow = () => ({ id: 'live-test', name: 'n8n live test' });
	return ctx;
}

async function hook(methodName, params, staticData, webhookUrl) {
	requestLog = [];
	const ctx = triggerContext(params, staticData, { getNodeWebhookUrl: () => webhookUrl });
	activeToken = triggerToken;
	try {
		return await new XurrentTrigger().webhookMethods.default[methodName].call(ctx);
	} finally {
		activeToken = undefined;
	}
}

/** Simulates an incoming webhook call. Returns the trigger result and the response status sent. */
async function webhook(params, staticData, { body, query = {}, rawBody }) {
	requestLog = [];
	const response = { statusCode: 200, sent: undefined };
	const ctx = triggerContext(params, staticData, {
		getBodyData: () => body,
		getQueryData: () => query,
		getRequestObject: () => ({ rawBody: rawBody ? Buffer.from(rawBody) : undefined }),
		getResponseObject: () => ({
			status(code) { response.statusCode = code; return this; },
			send(value) { response.sent = value; return this; },
		}),
	});
	const result = await new XurrentTrigger().webhook.call(ctx);
	return { result, response };
}

const rl = (value, mode = 'id') => ({ __rl: true, mode, value: String(value) });

/** Runs fn with the trigger token, for raw checks of webhooks. */
async function asTrigger(fn) {
	activeToken = triggerToken;
	try {
		return await fn();
	} finally {
		activeToken = undefined;
	}
}

module.exports = { run, method, hook, webhook, rl, asTrigger, getLog: () => requestLog, credentials, httpRequestWithAuthentication };
