import type {
	IDisplayOptions,
	INodeCredentialDescription,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';

import { enumOptions } from '../constants';

interface LocatorOptions {
	displayName: string;
	name: string;
	searchListMethod: string;
	description?: string;
	required?: boolean;
	displayOptions?: IDisplayOptions;
}

/** Resource locator for a Xurrent record: pick from a searchable list, enter its ID or paste its URL. */
export function locatorField(options: LocatorOptions): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: options.required,
		description: options.description,
		displayOptions: options.displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: options.searchListMethod, searchable: true },
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: '12345',
				validation: [{ type: 'regex', properties: { regex: '^\\d+$', errorMessage: 'Not a valid ID (number)' } }],
			},
			{
				displayName: 'By URL',
				name: 'url',
				type: 'string',
				placeholder: 'https://wdc.xurrent.com/requests/12345',
				extractValue: { type: 'regex', regex: '/(\\d+)(?:[/?#].*)?$' },
				validation: [
					{
						type: 'regex',
						properties: { regex: '^https?://.+/\\d+(?:[/?#].*)?$', errorMessage: 'Not a valid Xurrent record URL' },
					},
				],
			},
		],
	};
}

export function returnAllFields(displayOptions: IDisplayOptions): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions,
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: { ...displayOptions, show: { ...displayOptions.show, returnAll: [false] } },
		},
	];
}

export const customQueryField: INodeProperties = {
	displayName: 'Custom Query Parameters',
	name: 'customQuery',
	type: 'fixedCollection',
	placeholder: 'Add Parameter',
	typeOptions: { multipleValues: true },
	default: {},
	description:
		'Additional query parameters, e.g. any <a href="https://developer.xurrent.com/v1/general/filtering/">filter</a> such as "updated_at" = ">=2026-01-01T00:00:00Z" or "team_id" = "!"',
	options: [
		{
			displayName: 'Parameter',
			name: 'parameter',
			values: [
				{ displayName: 'Name', name: 'name', type: 'string', default: '', placeholder: 'status' },
				{ displayName: 'Value', name: 'value', type: 'string', default: '', placeholder: '!completed' },
			],
		},
	],
};

/** Options of every Get Many operation: field selection, ordering and free query parameters. */
export const listOptionFields: INodeProperties[] = [
	customQueryField,
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'string',
		default: '',
		placeholder: 'subject,status,team,member,requested_for,created_at',
		description:
			'Comma-separated fields to return instead of the default fields of the collection (<a href="https://developer.xurrent.com/v1/general/field_selection/">field selection</a>)',
	},
	{
		displayName: 'Sort',
		name: 'sort',
		type: 'string',
		default: '',
		placeholder: '-created_at',
		description:
			'Field to sort by; prefix with "-" for descending order, combine with commas (<a href="https://developer.xurrent.com/v1/general/ordering/">ordering</a>)',
	},
];

export const customFieldsField: INodeProperties = {
	displayName: 'Custom Fields (JSON)',
	name: 'customFields',
	type: 'json',
	default: '[]',
	// eslint-disable-next-line n8n-nodes-base/node-param-description-miscased-id -- "id" is the literal JSON key
	description:
		'Custom fields of the UI extension, as [{"id": "field_id", "value": "…"}] or {"field_id": "value"}',
};

export const extraFieldsField: INodeProperties = {
	displayName: 'Extra Fields (JSON)',
	name: 'extraFields',
	type: 'json',
	default: '{}',
	description:
		'Any other API fields sent as-is, e.g. {"agile_board_id": 3, "checked_items": ["a"]}. Overrides the fields set above.',
};

export function enumField(
	displayName: string,
	name: string,
	values: string[],
	description?: string,
	defaultValue = '',
): INodeProperties {
	return { displayName, name, type: 'options', options: enumOptions(values), default: defaultValue, description };
}

export function enumListFilter(displayName: string, name: string, values: string[]): INodeProperties {
	return { displayName, name, type: 'multiOptions', options: enumOptions(values), default: [] };
}

export function dateFilters(prefix: string, label: string): INodeProperties[] {
	return [
		{
			displayName: `${label} After`,
			name: `${prefix}After`,
			type: 'dateTime',
			default: '',
		},
		{
			displayName: `${label} Before`,
			name: `${prefix}Before`,
			type: 'dateTime',
			default: '',
		},
	];
}

export function sortByDisplayName(properties: INodeProperties[]): INodeProperties[] {
	return [...properties].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function op(name: string, value: string, action: string, description = action): INodePropertyOptions {
	return { name, value, action, description };
}

export const authenticationProperty: INodeProperties = {
	displayName: 'Authentication',
	name: 'authentication',
	type: 'options',
	options: [
		{ name: 'Personal Access Token', value: 'accessToken' },
		{ name: 'OAuth (Client Credentials)', value: 'oAuth' },
	],
	default: 'accessToken',
};

export const xurrentCredentials: INodeCredentialDescription[] = [
	{ name: 'xurrentApi', required: true, displayOptions: { show: { authentication: ['accessToken'] } } },
	{ name: 'xurrentOAuthApi', required: true, displayOptions: { show: { authentication: ['oAuth'] } } },
];
