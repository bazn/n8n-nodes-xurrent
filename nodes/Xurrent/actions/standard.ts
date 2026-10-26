import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	buildBody,
	buildFilterQuery,
	collectionPath,
	compact,
	customQuery,
	type FieldMap,
	type FilterMap,
	listOptionsQuery,
	requireRecordId,
	xurrentApiRequest,
	xurrentApiRequestAllItems,
	xurrentApiRequestWhenReady,
} from '../GenericFunctions';

export interface StandardRuntime {
	collection: string;
	label: string;
	fieldMap: FieldMap;
	filterMap: FilterMap;
	/** Path a record is created at; defaults to the collection (tasks are created inside a workflow). */
	createPath?: (fields: IDataObject) => string;
	/** Whether writes may hit a record that is still being built (see xurrentApiRequestWhenReady). */
	retryWhileBeingCreated?: boolean;
}

/** Note body for POST …/notes. */
export function buildNoteBody(text: string, options: IDataObject): IDataObject {
	const keys = String(options.attachmentKeys ?? '')
		.split(',')
		.map((key) => key.trim())
		.filter(Boolean);
	return compact({
		text,
		internal: options.internal === true ? true : undefined,
		suppress_note_added_notifications: options.suppressNotifications === true ? true : undefined,
		attachments: keys.map((key) => ({ key })),
	});
}

export function limitOf(this: IExecuteFunctions, itemIndex: number): number | undefined {
	return this.getNodeParameter('returnAll', itemIndex, false)
		? undefined
		: (this.getNodeParameter('limit', itemIndex, 50) as number);
}

/** Runs the common operations (create, get, getAll, update, notes, archive/trash/restore). */
export async function executeStandard(
	this: IExecuteFunctions,
	runtime: StandardRuntime,
	operation: string,
	itemIndex: number,
	createFieldNames: string[] = [],
): Promise<IDataObject | IDataObject[]> {
	const { collection, fieldMap, filterMap } = runtime;
	const write = runtime.retryWhileBeingCreated ? xurrentApiRequestWhenReady : xurrentApiRequest;

	if (operation === 'create') {
		const fields: IDataObject = {};
		for (const name of createFieldNames) {
			fields[name] = this.getNodeParameter(name, itemIndex, '');
		}
		Object.assign(fields, this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject);
		const body = buildBody.call(this, fieldMap, fields, itemIndex);
		const path = runtime.createPath ? runtime.createPath(fields) : collection;
		return (await write.call(this, 'POST', path, body)) as IDataObject;
	}

	if (operation === 'getAll') {
		const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
		const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
		const qs = {
			...buildFilterQuery(filterMap, filters),
			...listOptionsQuery(options),
			...customQuery(options.customQuery),
		};
		return xurrentApiRequestAllItems.call(
			this,
			collectionPath(collection, this.getNodeParameter('predefinedFilter', itemIndex, 'all')),
			qs,
			limitOf.call(this, itemIndex),
		);
	}

	const id = requireRecordId.call(this, 'recordId', itemIndex, runtime.label);
	const recordPath = `${collection}/${encodeURIComponent(id)}`;

	switch (operation) {
		case 'get': {
			const options = this.getNodeParameter('getOptions', itemIndex, {}) as IDataObject;
			return (await xurrentApiRequest.call(this, 'GET', recordPath, undefined, listOptionsQuery(options))) as IDataObject;
		}

		case 'update': {
			const fields = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
			const body = buildBody.call(this, fieldMap, fields, itemIndex);
			if (Object.keys(body).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', { itemIndex });
			}
			return (await write.call(this, 'PATCH', recordPath, body)) as IDataObject;
		}

		case 'addNote': {
			const body = buildNoteBody(
				this.getNodeParameter('noteText', itemIndex) as string,
				this.getNodeParameter('noteOptions', itemIndex, {}) as IDataObject,
			);
			return (await write.call(this, 'POST', `${recordPath}/notes`, body)) as IDataObject;
		}

		case 'getNotes': {
			const visibility = this.getNodeParameter('noteVisibility', itemIndex, 'all') as string;
			return xurrentApiRequestAllItems.call(
				this,
				collectionPath(`${recordPath}/notes`, visibility),
				{},
				limitOf.call(this, itemIndex),
			);
		}

		case 'archive':
		case 'trash':
		case 'restore': {
			const response = (await xurrentApiRequest.call(this, 'POST', `${recordPath}/${operation}`)) as IDataObject;
			return Object.keys(response).length ? response : { success: true, id: Number(id) };
		}
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}
