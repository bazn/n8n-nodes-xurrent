import { constants as cryptoConstants, createPublicKey, randomBytes, timingSafeEqual, verify } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, UserError } from 'n8n-workflow';

import { EVENT_COLLECTIONS, WEBHOOK_EVENTS, eventLabel } from '../Xurrent/constants';
import { authenticationProperty, xurrentCredentials } from '../Xurrent/descriptions/shared';
import { xurrentApiRequest } from '../Xurrent/GenericFunctions';

interface TriggerStaticData {
	webhooks?: Array<{ id: number; event: string }>;
	secret?: string;
}

const eventOptions = WEBHOOK_EVENTS.map((event) => ({ name: eventLabel(event), value: event })).sort((a, b) =>
	a.name.localeCompare(b.name),
);

const JWT_ALGORITHMS: Record<string, { hash: string; padding?: number; ieee?: boolean }> = {
	RS256: { hash: 'sha256' },
	RS384: { hash: 'sha384' },
	RS512: { hash: 'sha512' },
	PS256: { hash: 'sha256', padding: cryptoConstants.RSA_PKCS1_PSS_PADDING },
	PS384: { hash: 'sha384', padding: cryptoConstants.RSA_PKCS1_PSS_PADDING },
	PS512: { hash: 'sha512', padding: cryptoConstants.RSA_PKCS1_PSS_PADDING },
	ES256: { hash: 'sha256', ieee: true },
	ES384: { hash: 'sha384', ieee: true },
	ES512: { hash: 'sha512', ieee: true },
};

function base64UrlDecode(part: string): Buffer {
	return Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function isJwt(value: unknown): value is string {
	return typeof value === 'string' && /^[\w-]+\.[\w-]+\.[\w-]*$/.test(value.trim());
}

/**
 * Decodes the JWT a webhook policy turns the payload into. With a public key the signature and
 * expiry are verified; an invalid token throws.
 */
export function decodeJwt(token: string, publicKey?: string): IDataObject {
	const [headerPart, payloadPart, signaturePart] = token.trim().split('.');
	const header = JSON.parse(base64UrlDecode(headerPart).toString('utf8')) as { alg?: string };
	const claims = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as IDataObject;
	if (publicKey) {
		const algorithm = JWT_ALGORITHMS[String(header.alg).toUpperCase()];
		if (!algorithm) throw new UserError(`Unsupported JWT algorithm "${String(header.alg)}"`);
		const valid = verify(
			algorithm.hash,
			Buffer.from(`${headerPart}.${payloadPart}`),
			{
				key: createPublicKey(publicKey.replace(/\\n/g, '\n')),
				...(algorithm.padding !== undefined ? { padding: algorithm.padding } : {}),
				...(algorithm.ieee ? { dsaEncoding: 'ieee-p1363' as const } : {}),
			},
			base64UrlDecode(signaturePart),
		);
		if (!valid) throw new UserError('Invalid JWT signature');
		if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) throw new UserError('JWT has expired');
	}
	return claims;
}

/** The webhook message from a JWT: Xurrent puts it in the `data` claim. */
function messageFromClaims(claims: IDataObject): IDataObject {
	return claims.data && typeof claims.data === 'object' ? (claims.data as IDataObject) : claims;
}

function secretsMatch(expected: string, actual: unknown): boolean {
	const a = Buffer.from(expected);
	const b = Buffer.from(typeof actual === 'string' ? actual : '');
	return a.length === b.length && timingSafeEqual(a, b);
}

export class XurrentTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Xurrent Trigger',
		name: 'xurrentTrigger',
		icon: { light: 'file:../Xurrent/xurrent.svg', dark: 'file:../Xurrent/xurrent.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when Xurrent sends a webhook event, e.g. a request was created or a note was added',
		defaults: {
			name: 'Xurrent Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: xurrentCredentials,
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			authenticationProperty,
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: eventOptions,
				default: ['request.create'],
				required: true,
				description: 'Events to listen to. One Xurrent webhook is registered per event.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Fetch Note',
						name: 'fetchNote',
						type: 'boolean',
						default: true,
						description: 'Whether to load the note of "note added" events and return it as "note"',
					},
					{
						displayName: 'Fetch Record',
						name: 'fetchRecord',
						type: 'boolean',
						default: true,
						description:
							'Whether to load the full record the event is about (request, task, …) and return it as "record". Webhook payloads only contain IDs and a few fields.',
					},
					{
						displayName: 'Ignore Events by Person IDs',
						name: 'ignorePersonIds',
						type: 'string',
						default: '',
						placeholder: '123, 456',
						description:
							'Comma-separated IDs of people whose changes are ignored, e.g. the integration user, to avoid loops',
					},
					{
						displayName: 'Webhook Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'Description stored with the webhooks in Xurrent',
					},
					{
						displayName: 'Webhook Policy Public Key',
						name: 'publicKey',
						type: 'string',
						typeOptions: { password: true, rows: 4 },
						default: '',
						placeholder: '-----BEGIN PUBLIC KEY-----…',
						description:
							'Public key (PEM) of the webhook policy linked to the webhooks. When set, only messages with a valid JWT signature are accepted.',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
				const events = this.getNodeParameter('events', []) as string[];
				const registered = staticData.webhooks ?? [];
				if (!registered.length || !staticData.secret) return false;
				if ([...events].sort().join() !== registered.map((webhook) => webhook.event).sort().join()) return false;

				const expectedUri = webhookUri(this, staticData.secret);
				for (const webhook of registered) {
					try {
						const existing = (await xurrentApiRequest.call(this, 'GET', `webhooks/${webhook.id}`)) as IDataObject;
						if (existing.uri !== expectedUri || existing.disabled === true) return false;
					} catch (error) {
						this.logger.debug(`Xurrent webhook ${webhook.id} not found, it will be recreated`, { error });
						return false;
					}
				}
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
				await deleteWebhooks(this, staticData);

				const events = this.getNodeParameter('events', []) as string[];
				if (!events.length) throw new NodeOperationError(this.getNode(), 'Select at least one event');
				const options = this.getNodeParameter('options', {}) as IDataObject;
				const secret = randomBytes(24).toString('hex');
				const uri = webhookUri(this, secret);
				const name = `n8n: ${this.getWorkflow().name ?? this.getWorkflow().id ?? 'workflow'}`.slice(0, 120);

				const created: Array<{ id: number; event: string }> = [];
				try {
					for (const event of events) {
						// Xurrent sends webhook.verify to the URI right away; webhook() answers it.
						const webhook = (await xurrentApiRequest.call(this, 'POST', 'webhooks', {
							event,
							uri,
							name,
							...(options.description ? { description: options.description } : {}),
						})) as IDataObject;
						created.push({ id: Number(webhook.id), event });
					}
				} catch (error) {
					await deleteWebhooks(this, { webhooks: created });
					throw new NodeApiError(this.getNode(), error as JsonObject, {
						message: (error as Error).message,
						description: (error as NodeApiError).description ?? undefined,
					});
				}
				staticData.webhooks = created;
				staticData.secret = secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
				await deleteWebhooks(this, staticData);
				delete staticData.webhooks;
				delete staticData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const response = this.getResponseObject();

		if (staticData.secret && !secretsMatch(staticData.secret, (this.getQueryData() as IDataObject).secret)) {
			response.status(401).send('Unauthorized');
			return { noWebhookResponse: true };
		}

		let message: IDataObject;
		const body = this.getBodyData() as unknown;
		const raw = this.getRequestObject().rawBody?.toString('utf8').trim();
		const token = isJwt(body) ? body : isJwt(raw) ? raw : undefined;
		const publicKey = String(options.publicKey ?? '').trim();
		try {
			if (token) {
				message = messageFromClaims(decodeJwt(token, publicKey || undefined));
			} else if (publicKey) {
				throw new UserError('Expected a signed JWT message');
			} else {
				message = (body && typeof body === 'object' ? body : JSON.parse(raw || '{}')) as IDataObject;
			}
		} catch {
			response.status(401).send('Invalid signature');
			return { noWebhookResponse: true };
		}

		const payload = (message.payload ?? {}) as IDataObject;
		const event = String(message.event ?? '');

		if (event === 'webhook.verify') {
			if (payload.callback) {
				await this.helpers.httpRequest({ method: 'GET', url: String(payload.callback) });
			}
			return { webhookResponse: 'Verified' };
		}

		const ignored = String(options.ignorePersonIds ?? '')
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean);
		if (message.person_id !== undefined && ignored.includes(String(message.person_id))) {
			return { webhookResponse: 'Ignored' };
		}

		const output: IDataObject = { ...message };
		const collection = EVENT_COLLECTIONS[event.split('.')[0]];
		if (options.fetchRecord !== false && collection && message.object_id && !event.endsWith('.delete')) {
			try {
				output.record = await xurrentApiRequest.call(this, 'GET', `${collection}/${String(message.object_id)}`);
			} catch (error) {
				output.recordError = (error as Error).message;
			}
		}
		if (options.fetchNote !== false && payload.note_id) {
			try {
				output.note = await xurrentApiRequest.call(this, 'GET', `notes/${String(payload.note_id)}`);
			} catch (error) {
				output.noteError = (error as Error).message;
			}
		}

		return { workflowData: [this.helpers.returnJsonArray(output)] };
	}
}

function webhookUri(context: IHookFunctions, secret: string): string {
	const url = context.getNodeWebhookUrl('default') as string;
	return `${url}${url.includes('?') ? '&' : '?'}secret=${secret}`;
}

async function deleteWebhooks(context: IHookFunctions, staticData: TriggerStaticData): Promise<void> {
	for (const webhook of staticData.webhooks ?? []) {
		try {
			await xurrentApiRequest.call(context, 'DELETE', `webhooks/${webhook.id}`);
		} catch {
			// already removed in Xurrent
		}
	}
}
