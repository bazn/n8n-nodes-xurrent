import type { IDataObject, IExecuteFunctions, IHttpRequestMethods, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	customQuery,
	listOptionsQuery,
	parseJsonParameter,
	xurrentApiRequest,
	xurrentApiRequestAllItems,
	xurrentRawRequest,
} from '../GenericFunctions';
import { limitOf } from './standard';

/** Collection path from the locator, e.g. "teams" or "requests/123/cis". */
function collectionOf(this: IExecuteFunctions, itemIndex: number): string {
	const value = String(this.getNodeParameter('collection', itemIndex, '', { extractValue: true }) ?? '')
		.trim()
		.replace(/^\/+|\/+$/g, '');
	if (!value) throw new NodeOperationError(this.getNode(), 'No collection specified', { itemIndex });
	return value;
}

function recordPathOf(this: IExecuteFunctions, itemIndex: number): string {
	const id = String(this.getNodeParameter('recordPathId', itemIndex, '')).trim();
	if (!id) throw new NodeOperationError(this.getNode(), 'No record ID specified', { itemIndex });
	return `${collectionOf.call(this, itemIndex)}/${encodeURIComponent(id)}`;
}

export async function executeRecord(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'getAll': {
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			return xurrentApiRequestAllItems.call(
				this,
				collectionOf.call(this, itemIndex),
				{ ...listOptionsQuery(options), ...customQuery(options.customQuery) },
				limitOf.call(this, itemIndex),
			);
		}

		case 'get': {
			const options = this.getNodeParameter('getOptions', itemIndex, {}) as IDataObject;
			return (await xurrentApiRequest.call(
				this,
				'GET',
				recordPathOf.call(this, itemIndex),
				undefined,
				listOptionsQuery(options),
			)) as IDataObject;
		}

		case 'create':
		case 'update': {
			const body = parseJsonParameter.call(this, this.getNodeParameter('body', itemIndex), 'Body (JSON)', itemIndex);
			return (await xurrentApiRequest.call(
				this,
				operation === 'create' ? 'POST' : 'PATCH',
				operation === 'create' ? collectionOf.call(this, itemIndex) : recordPathOf.call(this, itemIndex),
				body,
			)) as IDataObject;
		}

		case 'delete': {
			const path = recordPathOf.call(this, itemIndex);
			await xurrentApiRequest.call(this, 'DELETE', path);
			return { success: true, deleted: path };
		}

		case 'request': {
			const method = this.getNodeParameter('method', itemIndex) as IHttpRequestMethods;
			const path = String(this.getNodeParameter('path', itemIndex)).trim();
			const qs = parseJsonParameter.call(this, this.getNodeParameter('query', itemIndex, '{}'), 'Query Parameters (JSON)', itemIndex);
			if (method === 'GET' && this.getNodeParameter('readAllPages', itemIndex, false)) {
				return xurrentApiRequestAllItems.call(this, path, qs);
			}
			const body =
				method === 'GET' || method === 'DELETE'
					? undefined
					: parseJsonParameter.call(this, this.getNodeParameter('requestBody', itemIndex, '{}'), 'Body (JSON)', itemIndex);
			const response = await xurrentApiRequest.call(this, method, path, body, qs);
			if (Array.isArray(response)) return response as IDataObject[];
			if (response && typeof response === 'object') {
				return Object.keys(response as IDataObject).length ? (response as IDataObject) : { success: true };
			}
			return { response };
		}
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}

/** Key of an uploaded file: S3 answers XML with a <Key> element, local storage answers JSON with "key". */
export function extractUploadKey(response: unknown, fallbackKey?: string, fileName?: string): string | undefined {
	if (response && typeof response === 'object' && 'key' in (response as IDataObject)) {
		return String((response as IDataObject).key);
	}
	const text = Buffer.isBuffer(response) ? response.toString('utf8') : typeof response === 'string' ? response : '';
	const match = /<Key>([^<]+)<\/Key>/.exec(text);
	if (match) return match[1].replace(/&amp;/g, '&');
	if (text.trim().startsWith('{')) {
		try {
			const parsed = JSON.parse(text) as IDataObject;
			if (parsed.key) return String(parsed.key);
		} catch {
			// not JSON
		}
	}
	// S3 without a response body: the key is the policy key with the file name filled in
	return fallbackKey && fileName ? fallbackKey.replace('${filename}', fileName) : undefined;
}

/**
 * Uploads a binary to the attachment storage: get the storage details, POST the file as
 * multipart/form-data (Content-Type first, then the provider parameters, then the file) and
 * return the key to use in note or *_attachments fields.
 */
async function uploadAttachment(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject> {
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
	const binary = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const fileName = binary.fileName ?? 'file';
	const mimeType = binary.mimeType || 'application/octet-stream';

	const storage = (await xurrentApiRequest.call(this, 'GET', 'attachments/storage')) as IDataObject;
	const provider = String(storage.provider ?? '');
	const uploadUri = String(storage.upload_uri ?? storage.uploadUri ?? '');
	const parameters = (storage.provider_parameters ??
		storage.providerParameters ??
		storage[provider] ??
		{}) as IDataObject;
	if (!uploadUri) {
		throw new NodeOperationError(this.getNode(), 'Xurrent did not return an upload URI for attachments', { itemIndex });
	}
	const sizeLimit = Number(storage.size_limit ?? storage.sizeLimit ?? 0);
	if (sizeLimit && buffer.length > sizeLimit) {
		throw new NodeOperationError(
			this.getNode(),
			`File "${fileName}" is ${buffer.length} bytes, Xurrent accepts at most ${sizeLimit} bytes`,
			{ itemIndex },
		);
	}

	const form = new FormData();
	form.append('Content-Type', mimeType);
	for (const [name, value] of Object.entries(parameters)) form.append(name, String(value));
	form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);

	// local storage lives in Xurrent and needs the credentials; S3 uploads are authorized by the policy
	const response =
		provider === 's3'
			? await this.helpers.httpRequest({ method: 'POST', url: uploadUri, body: form })
			: (await xurrentRawRequest.call(this, { method: 'POST', url: uploadUri, body: form })).body;

	const key = extractUploadKey(response, parameters.key as string | undefined, fileName);
	if (!key) {
		throw new NodeOperationError(this.getNode(), 'The upload succeeded but returned no attachment key', { itemIndex });
	}
	return { key, filesize: buffer.length, fileName, mimeType, provider };
}

function fileNameFromUrl(url: string): string {
	try {
		const last = new URL(url).pathname.split('/').filter(Boolean).pop();
		return last ? decodeURIComponent(last) : 'attachment';
	} catch {
		return 'attachment';
	}
}

async function downloadAttachment(this: IExecuteFunctions, itemIndex: number): Promise<INodeExecutionData> {
	const url = String(this.getNodeParameter('attachmentUrl', itemIndex)).trim();
	if (!/^https?:\/\//i.test(url)) {
		throw new NodeOperationError(this.getNode(), 'The attachment URL must be an absolute http(s) URL', { itemIndex });
	}
	const options = { method: 'GET' as const, url, encoding: 'arraybuffer' as const, returnFullResponse: true };
	let response: { body: unknown; headers: Record<string, unknown> };
	try {
		// attachment URIs are usually pre-signed and must not receive the API token
		response = (await this.helpers.httpRequest(options)) as typeof response;
	} catch {
		response = (await xurrentRawRequest.call(this, options)) as typeof response;
	}
	const data = Buffer.from(response.body as ArrayBuffer);
	const fileName = (this.getNodeParameter('fileName', itemIndex, '') as string) || fileNameFromUrl(url);
	const mimeType = String(response.headers['content-type'] ?? '').split(';')[0] || undefined;
	const outputName = this.getNodeParameter('outputBinaryPropertyName', itemIndex, 'data') as string;
	return {
		json: { fileName, mimeType, size: data.length, url },
		binary: { [outputName]: await this.helpers.prepareBinaryData(data, fileName, mimeType) },
	};
}

export async function executeAttachment(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<INodeExecutionData> {
	if (operation === 'upload') {
		return { json: await uploadAttachment.call(this, itemIndex) };
	}
	if (operation === 'download') {
		return downloadAttachment.call(this, itemIndex);
	}
	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}
