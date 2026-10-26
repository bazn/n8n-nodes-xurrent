import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeParameterResourceLocator,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

export type XurrentContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions | IWebhookFunctions;

export const TOKEN_CREDENTIAL = 'xurrentApi';
export const OAUTH_CREDENTIAL = 'xurrentOAuthApi';

/** Largest page the REST API returns (https://developer.xurrent.com/v1/general/pagination/). */
export const MAX_PER_PAGE = 100;

interface XurrentCredentials {
	environment?: string;
	customUrl?: string;
	account?: string;
	language?: string;
}

export function getBaseUrl(credentials: XurrentCredentials): string {
	if (credentials.environment && credentials.environment !== 'custom') {
		return `https://${credentials.environment}/v1`;
	}
	const trimmed = String(credentials.customUrl ?? '').trim().replace(/\/+$/, '');
	return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Credential type chosen in the node's "Authentication" parameter (personal access token by default). */
export function xurrentCredentialType(context: XurrentContext): string {
	let authentication: unknown;
	try {
		authentication =
			'getInputData' in context
				? (context as IExecuteFunctions).getNodeParameter('authentication', 0, 'accessToken')
				: (context as ILoadOptionsFunctions).getNodeParameter('authentication', 'accessToken');
	} catch {
		authentication = 'accessToken';
	}
	return authentication === 'oAuth' ? OAUTH_CREDENTIAL : TOKEN_CREDENTIAL;
}

export interface XurrentResponse {
	body: unknown;
	headers: Record<string, string | string[] | undefined>;
	statusCode: number;
}

/**
 * Request with the selected Xurrent credential. `url` may be absolute (e.g. a `next` link) or a path
 * relative to the API base URL. Returns the full response so callers can follow the Link header.
 */
export async function xurrentRawRequest(
	this: XurrentContext,
	options: Omit<IHttpRequestOptions, 'url'> & { url: string },
): Promise<XurrentResponse> {
	const credentialType = xurrentCredentialType(this);
	const credentials = await this.getCredentials<XurrentCredentials>(credentialType);
	const url = /^https?:\/\//i.test(options.url)
		? options.url
		: `${getBaseUrl(credentials)}/${options.url.replace(/^\/+/, '')}`;
	const headers: IDataObject = { Accept: 'application/json', ...(options.headers ?? {}) };
	if (credentials.language) headers['X-Xurrent-Language'] = credentials.language;

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, credentialType, {
			...options,
			url,
			headers,
			returnFullResponse: true,
		})) as XurrentResponse;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, extractXurrentError(error));
	}
}

export async function xurrentApiRequest(
	this: XurrentContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject | IDataObject[],
	qs: IDataObject = {},
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
	const options: Omit<IHttpRequestOptions, 'url'> & { url: string } = { method, url: endpoint, qs, json: true };
	if (body !== undefined) options.body = body;
	const response = await xurrentRawRequest.call(this, options);
	return response.body ?? {};
}

const NOT_FOUND_RETRIES = 6;
const NOT_FOUND_DELAY_MS = 2_000;

/**
 * Like xurrentApiRequest, but retries on 404 for a short while. Xurrent builds a workflow from its
 * template in the background, and until that is done the new workflow answers writes with 404
 * (verified live), e.g. when a task is added right after the workflow was created.
 */
export async function xurrentApiRequestWhenReady(
	this: XurrentContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject | IDataObject[],
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
	for (let attempt = 1; ; attempt++) {
		try {
			return await xurrentApiRequest.call(this, method, endpoint, body);
		} catch (error) {
			const apiError = error as NodeApiError;
			if (apiError.httpCode === '404' && attempt < NOT_FOUND_RETRIES) {
				await sleep(NOT_FOUND_DELAY_MS);
				continue;
			}
			throw new NodeApiError(this.getNode(), apiError.errorResponse ?? (error as JsonObject), {
				message: apiError.message,
				description: apiError.description ?? undefined,
				httpCode: apiError.httpCode ?? undefined,
			});
		}
	}
}

/** Error message and description from a Xurrent error body: `{ message, errors: [[field, text], …] }`. */
export function extractXurrentError(error: unknown): { message?: string; description?: string } {
	const candidate = error as {
		response?: { body?: unknown; data?: unknown };
		cause?: { response?: { data?: unknown; body?: unknown } };
	};
	const body =
		candidate.response?.body ??
		candidate.response?.data ??
		candidate.cause?.response?.data ??
		candidate.cause?.response?.body;
	if (!body || typeof body !== 'object') return {};
	const { message, errors } = body as { message?: unknown; errors?: unknown };
	const details = Array.isArray(errors)
		? errors
				.map((entry) => (Array.isArray(entry) ? entry.filter((part) => part !== '').join(': ') : String(entry)))
				.join('; ')
		: undefined;
	return {
		message: message !== undefined ? String(message) : undefined,
		description: details || undefined,
	};
}

/** Parses an RFC 8288 Link header into a map of rel → URL. */
export function parseLinkHeader(header: string | string[] | undefined): Record<string, string> {
	const value = Array.isArray(header) ? header.join(',') : header ?? '';
	const links: Record<string, string> = {};
	for (const match of value.matchAll(/<([^>]+)>\s*;\s*rel="?([^";,]+)"?/g)) {
		for (const rel of match[2].split(/\s+/)) links[rel] = match[1];
	}
	return links;
}

/**
 * Reads a collection. Follows the `next` link (cursor based) until `limit` records were read or no
 * further page exists. Without `limit`, every page is read.
 */
export async function xurrentApiRequestAllItems(
	this: XurrentContext,
	endpoint: string,
	qs: IDataObject = {},
	limit?: number,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	let url: string | undefined = endpoint;
	let query: IDataObject | undefined = {
		...qs,
		per_page: limit ? Math.min(limit, MAX_PER_PAGE) : MAX_PER_PAGE,
	};

	while (url) {
		const response: XurrentResponse = await xurrentRawRequest.call(this, {
			method: 'GET',
			url,
			qs: query,
			json: true,
		});
		const page = Array.isArray(response.body) ? (response.body as IDataObject[]) : [];
		results.push(...page);
		if (limit !== undefined && results.length >= limit) break;
		url = page.length ? parseLinkHeader(response.headers.link).next : undefined;
		// the next link already contains every query parameter
		query = undefined;
	}
	return limit !== undefined ? results.slice(0, limit) : results;
}

/** Drops empty values: Xurrent wants blank fields omitted from the input. */
export function compact(body: IDataObject): IDataObject {
	return Object.fromEntries(
		Object.entries(body).filter(
			([, value]) => value !== undefined && value !== '' && value !== null && !(Array.isArray(value) && value.length === 0),
		),
	);
}

/** Reads a value that may be a plain value or a resource locator (e.g. inside a collection). */
export function resolveLocatorValue(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === 'object' && 'value' in (value as IDataObject)) {
		const inner = (value as INodeParameterResourceLocator).value;
		return inner === undefined || inner === null || inner === '' ? undefined : String(inner).trim();
	}
	const text = String(value).trim();
	return text === '' ? undefined : text;
}

/** Record id from a resource locator, accepting a pasted Xurrent URL such as …/requests/12345. */
export function resolveRecordId(value: unknown): string | undefined {
	const resolved = resolveLocatorValue(value);
	if (!resolved) return undefined;
	const fromUrl = /\/(\d+)(?:[/?#].*)?$/.exec(resolved);
	return fromUrl && /^https?:\/\//i.test(resolved) ? fromUrl[1] : resolved;
}

export function requireRecordId(
	this: IExecuteFunctions,
	parameterName: string,
	itemIndex: number,
	label = 'record',
): string {
	const id = resolveRecordId(this.getNodeParameter(parameterName, itemIndex));
	if (!id) throw new NodeOperationError(this.getNode(), `No ${label} specified`, { itemIndex });
	return id;
}

export function parseIdList(value: unknown): number[] {
	const parts = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : [];
	return parts
		.map((part) => part.trim())
		.filter((part) => part !== '')
		.map(Number)
		.filter((id) => Number.isInteger(id));
}

/** Xurrent timestamps are UTC with seconds, e.g. 2026-01-05T23:00:00Z. */
export function toXurrentTimestamp(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const text = String(value);
	// no offset given: n8n date pickers deliver local wall-clock time, keep it as Xurrent interprets it
	if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) return text.slice(0, 19);
	const date = new Date(text);
	if (Number.isNaN(date.getTime())) return text;
	return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function parseJsonParameter(
	this: IExecuteFunctions,
	value: unknown,
	parameterName: string,
	itemIndex: number,
): IDataObject {
	if (value === undefined || value === null || value === '') return {};
	if (typeof value === 'object' && !Array.isArray(value)) return value as IDataObject;
	try {
		const parsed = JSON.parse(String(value)) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as IDataObject;
	} catch {
		// handled below
	}
	throw new NodeOperationError(this.getNode(), `"${parameterName}" must be a JSON object`, { itemIndex });
}

/** Custom fields are sent as `[{ id, value }]`; accepts that array or a plain `{ id: value }` object. */
export function parseCustomFields(
	this: IExecuteFunctions,
	value: unknown,
	itemIndex: number,
): IDataObject[] | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	let parsed: unknown = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value);
		} catch {
			throw new NodeOperationError(this.getNode(), '"Custom Fields" must be valid JSON', { itemIndex });
		}
	}
	if (Array.isArray(parsed)) return parsed.length ? (parsed as IDataObject[]) : undefined;
	if (parsed && typeof parsed === 'object') {
		const entries = Object.entries(parsed as IDataObject).map(([id, fieldValue]) => ({ id, value: fieldValue }));
		return entries.length ? entries : undefined;
	}
	throw new NodeOperationError(this.getNode(), '"Custom Fields" must be a JSON array or object', { itemIndex });
}

/**
 * How a node field is written to the API:
 * - `plain`: passed through under the API name
 * - `reference`: a resource locator, sent as `<name>_id`
 * - `references`: a comma-separated id list, sent as `<name>_ids`
 * - `timestamp`: a date, converted with toXurrentTimestamp
 */
export type FieldKind = 'plain' | 'reference' | 'references' | 'timestamp';
export type FieldMap = Record<string, { api: string; kind: FieldKind }>;

export function buildBody(this: IExecuteFunctions, map: FieldMap, fields: IDataObject, itemIndex: number): IDataObject {
	const body: IDataObject = {};
	for (const [key, value] of Object.entries(fields)) {
		const field = map[key];
		if (!field || value === '' || value === undefined || value === null) continue;
		if (field.kind === 'plain') {
			body[field.api] = value;
		} else if (field.kind === 'reference') {
			const id = resolveRecordId(value);
			if (id) body[`${field.api}_id`] = /^\d+$/.test(id) ? Number(id) : id;
		} else if (field.kind === 'references') {
			const ids = parseIdList(value);
			if (ids.length) body[`${field.api}_ids`] = ids;
		} else if (field.kind === 'timestamp') {
			body[field.api] = toXurrentTimestamp(value);
		}
	}
	const customFields = parseCustomFields.call(this, fields.customFields, itemIndex);
	if (customFields) body.custom_fields = customFields;
	return { ...body, ...parseJsonParameter.call(this, fields.extraFields, 'Extra Fields (JSON)', itemIndex) };
}

/**
 * Query parameters of a filter collection. Enum lists become `a,b`, references become `<name>_id`,
 * "after"/"before" dates become `>`/`<` comparisons on the given field (both may be combined).
 */
export type FilterKind = 'equals' | 'list' | 'reference' | 'after' | 'before' | 'boolean';
export type FilterMap = Record<string, { api: string; kind: FilterKind }>;

export function buildFilterQuery(map: FilterMap, filters: IDataObject): IDataObject {
	const qs: IDataObject = {};
	const ranges: Record<string, { after?: string; before?: string }> = {};
	for (const [key, value] of Object.entries(filters)) {
		const filter = map[key];
		if (!filter || value === '' || value === undefined || value === null) continue;
		if (filter.kind === 'equals') {
			qs[filter.api] = String(value);
		} else if (filter.kind === 'boolean') {
			qs[filter.api] = value ? 'true' : 'false';
		} else if (filter.kind === 'list') {
			const list = (Array.isArray(value) ? value : String(value).split(',')).map((part) => String(part).trim());
			if (list.filter(Boolean).length) qs[filter.api] = list.filter(Boolean).join(',');
		} else if (filter.kind === 'reference') {
			const id = resolveRecordId(value);
			if (id) qs[`${filter.api}_id`] = id;
		} else {
			const timestamp = toXurrentTimestamp(value);
			if (timestamp) ranges[filter.api] = { ...ranges[filter.api], [filter.kind]: timestamp };
		}
	}
	for (const [api, range] of Object.entries(ranges)) {
		qs[api] = `${range.after ? `>${range.after}` : ''}${range.before ? `<${range.before}` : ''}`;
	}
	return qs;
}

/** Query parameters from the "Custom Query Parameters" fixed collection. */
export function customQuery(value: unknown): IDataObject {
	const parameters = ((value as IDataObject | undefined)?.parameter as IDataObject[] | undefined) ?? [];
	return Object.fromEntries(
		parameters.filter((parameter) => parameter.name).map((parameter) => [String(parameter.name), parameter.value ?? '']),
	);
}

/** The `fields` and `sort` query parameters from a Get Many options collection. */
export function listOptionsQuery(options: IDataObject): IDataObject {
	return compact({
		fields: String(options.fields ?? '')
			.split(',')
			.map((field) => field.trim())
			.filter(Boolean)
			.join(','),
		sort: options.sort ? String(options.sort).trim() : undefined,
	});
}

/** Collection path with an optional predefined filter, e.g. `requests/open`. */
export function collectionPath(collection: string, predefinedFilter?: unknown): string {
	const filter = predefinedFilter ? String(predefinedFilter).trim() : '';
	return filter && filter !== 'all' ? `${collection}/${encodeURIComponent(filter)}` : collection;
}
