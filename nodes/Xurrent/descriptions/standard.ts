import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import { enumLabel } from '../constants';
import { listOptionFields, locatorField, op, returnAllFields, sortByDisplayName } from './shared';

/** Describes a record resource that follows the common REST pattern of the Xurrent API. */
export interface StandardSpec {
	resource: string;
	/** Singular noun used in labels, e.g. "request". */
	label: string;
	/** Plural noun used in labels, e.g. "requests". */
	plural: string;
	searchListMethod: string;
	/** Common operations offered: any of create, get, getAll, update, addNote, getNotes, archive, trash, restore. */
	operations: string[];
	/** Resource specific operations in addition to the common ones. */
	extraOperations?: INodePropertyOptions[];
	/** Operations (besides the common ones) that work on one record and need the record locator. */
	extraIdOperations?: string[];
	/** Top-level fields of the create operation (required or important ones). */
	createFields?: INodeProperties[];
	/** Fields offered under "Additional Fields" (create) and "Update Fields". */
	dataFields: INodeProperties[];
	/** Fields that can only be set on update (e.g. status changes). */
	updateOnlyFields?: INodeProperties[];
	/** Names of create fields that cannot be changed later and are left out of "Update Fields". */
	createOnlyFields?: string[];
	filterFields: INodeProperties[];
	predefinedFilters: string[];
	defaultOperation?: string;
}

const RECORD_OPERATIONS = ['get', 'update', 'addNote', 'getNotes', 'archive', 'trash', 'restore'];

function commonOperations(spec: StandardSpec): INodePropertyOptions[] {
	const { label, plural } = spec;
	const all: Record<string, INodePropertyOptions> = {
		addNote: op('Add Note', 'addNote', `Add a note to a ${label}`),
		archive: op('Archive', 'archive', `Move a ${label} to the archive`),
		create: op('Create', 'create', `Create a ${label}`),
		get: op('Get', 'get', `Get a ${label}`),
		getAll: op('Get Many', 'getAll', `Get many ${enumLabel(plural).toLowerCase()}`),
		getNotes: op('Get Notes', 'getNotes', `Get the notes of a ${label}`),
		restore: op('Restore', 'restore', `Restore a ${label} from the archive or trash`),
		trash: op('Trash', 'trash', `Move a ${label} to the trash`),
		update: op('Update', 'update', `Update a ${label}`),
	};
	return spec.operations.map((operation) => all[operation]);
}

/** Note fields of the Add Note operation; also used by the attachment upload. */
export function noteFields(show: Record<string, string[]>): INodeProperties[] {
	return [
		{
			displayName: 'Note',
			name: 'noteText',
			type: 'string',
			typeOptions: { rows: 4 },
			default: '',
			required: true,
			description: 'Text of the note (Markdown/rich text, max 64 KB)',
			displayOptions: { show },
		},
		{
			displayName: 'Note Options',
			name: 'noteOptions',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: { show },
			options: [
				{
					displayName: 'Attachment Keys',
					name: 'attachmentKeys',
					type: 'string',
					default: '',
					placeholder: '={{ $json.key }}',
					description: 'Comma-separated storage keys of files uploaded with Attachment → Upload',
				},
				{
					displayName: 'Internal',
					name: 'internal',
					type: 'boolean',
					default: false,
					description: 'Whether the note is internal, so only specialists, auditors and administrators can see it',
				},
				{
					displayName: 'Suppress Notifications',
					name: 'suppressNotifications',
					type: 'boolean',
					default: false,
					description: 'Whether to suppress the "note added" notifications',
				},
			],
		},
	];
}

export function standardDescription(spec: StandardSpec): INodeProperties[] {
	const show = (operation: string[]) => ({ show: { resource: [spec.resource], operation } });
	const idOperations = [...RECORD_OPERATIONS, ...(spec.extraIdOperations ?? [])];
	const operations = [...commonOperations(spec), ...(spec.extraOperations ?? [])].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const recordName = spec.label.replace(/(^|\s)\w/g, (char) => char.toUpperCase());

	const properties: INodeProperties[] = [
		// eslint-disable-next-line n8n-nodes-base/node-param-default-missing -- the default is the spec's operation
		{
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [spec.resource] } },
			options: operations,
			default: spec.defaultOperation ?? 'get',
		},
		locatorField({
			displayName: recordName,
			name: 'recordId',
			searchListMethod: spec.searchListMethod,
			required: true,
			description: `The ${spec.label} to work on`,
			displayOptions: show(idOperations),
		}),
	];

	if (spec.operations.includes('create')) {
		properties.push(
			...(spec.createFields ?? []).map((field) => ({ ...field, displayOptions: show(['create']) })),
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: show(['create']),
				options: sortByDisplayName(spec.dataFields),
			},
		);
	}

	if (spec.operations.includes('update')) {
		properties.push({
			displayName: 'Update Fields',
			name: 'updateFields',
			type: 'collection',
			placeholder: 'Add Field',
			default: {},
			displayOptions: show(['update']),
			options: sortByDisplayName([
				...(spec.createFields ?? [])
					.filter((field) => !(spec.createOnlyFields ?? []).includes(field.name))
					.map((field) => ({ ...field, required: false })),
				...spec.dataFields,
				...(spec.updateOnlyFields ?? []),
			]),
		});
	}

	if (spec.operations.includes('getAll')) {
		properties.push(
			...returnAllFields(show(['getAll'])),
			{
				displayName: 'View',
				name: 'predefinedFilter',
				type: 'options',
				// eslint-disable-next-line n8n-nodes-base/node-param-default-wrong-for-options -- "all" is the first option
				default: 'all',
				description: 'Predefined filter of the collection, like the views in the Xurrent UI',
				displayOptions: show(['getAll']),
				options: [
					{ name: `All ${enumLabel(spec.plural)}`, value: 'all' },
					...spec.predefinedFilters.map((filter) => ({ name: enumLabel(filter), value: filter })),
				],
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: show(['getAll']),
				options: sortByDisplayName(spec.filterFields),
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: show(['getAll']),
				options: listOptionFields,
			},
		);
	}

	if (spec.operations.includes('get')) {
		properties.push({
			displayName: 'Options',
			name: 'getOptions',
			type: 'collection',
			placeholder: 'Add Option',
			default: {},
			displayOptions: show(['get']),
			options: [listOptionFields[1]],
		});
	}

	if (spec.operations.includes('addNote')) {
		properties.push(...noteFields({ resource: [spec.resource], operation: ['addNote'] }));
	}

	if (spec.operations.includes('getNotes')) {
		properties.push(...returnAllFields(show(['getNotes'])), {
			displayName: 'Notes',
			name: 'noteVisibility',
			type: 'options',
			default: 'all',
			displayOptions: show(['getNotes']),
			options: [
				{ name: 'All', value: 'all' },
				{ name: 'Public Only', value: 'public' },
				{ name: 'Internal Only', value: 'internal' },
			],
		});
	}

	return properties;
}
