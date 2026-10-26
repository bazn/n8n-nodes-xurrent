import type { INodeProperties } from 'n8n-workflow';

import { IMPACTS, PROBLEM_CATEGORIES, PROBLEM_STATUSES } from '../constants';
import { customFieldsField, dateFilters, enumField, enumListFilter, extraFieldsField, locatorField } from './shared';
import { standardDescription } from './standard';

const dataFields: INodeProperties[] = [
	{
		displayName: 'Analysis Target',
		name: 'analysisTargetAt',
		type: 'dateTime',
		default: '',
	},
	enumField('Category', 'category', PROBLEM_CATEGORIES, undefined, 'reactive'),
	{
		displayName: 'Complete Requests',
		name: 'completeRequests',
		type: 'boolean',
		default: false,
		description: 'Whether the linked requests are completed when the problem is solved',
	},
	customFieldsField,
	{
		displayName: 'Customer Resolution',
		name: 'customerResolution',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
	},
	extraFieldsField,
	locatorField({ displayName: 'Knowledge Article', name: 'knowledgeArticle', searchListMethod: 'searchKnowledgeArticles' }),
	{
		displayName: 'Known Error',
		name: 'knownError',
		type: 'boolean',
		default: false,
	},
	locatorField({ displayName: 'Member (Assignee)', name: 'member', searchListMethod: 'searchPeople' }),
	{
		displayName: 'Note',
		name: 'note',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
	},
	{
		displayName: 'Planned Effort (Minutes)',
		name: 'plannedEffort',
		type: 'number',
		typeOptions: { minValue: 0 },
		default: 0,
	},
	{
		displayName: 'Resolution',
		name: 'resolution',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'Required by some accounts for the status Solved',
	},
	{ displayName: 'Source', name: 'source', type: 'string', default: '' },
	{ displayName: 'Source ID', name: 'sourceID', type: 'string', default: '' },
	enumField('Status', 'status', PROBLEM_STATUSES),
	locatorField({ displayName: 'Supplier', name: 'supplier', searchListMethod: 'searchOrganizations' }),
	{ displayName: 'Supplier Request ID', name: 'supplierRequestID', type: 'string', default: '' },
	{ displayName: 'Time Spent (Minutes)', name: 'timeSpent', type: 'number', typeOptions: { minValue: 0 }, default: 0 },
	{ displayName: 'Urgent', name: 'urgent', type: 'boolean', default: false },
	{
		displayName: 'Waiting Until',
		name: 'waitingUntil',
		type: 'dateTime',
		default: '',
		description: 'Only when the status is Waiting For',
	},
	{ displayName: 'Workaround', name: 'workaround', type: 'string', typeOptions: { rows: 3 }, default: '' },
	locatorField({ displayName: 'Workflow', name: 'workflow', searchListMethod: 'searchWorkflows' }),
];

const filterFields: INodeProperties[] = [
	...dateFilters('created', 'Created'),
	enumListFilter('Impact', 'impacts', IMPACTS),
	locatorField({ displayName: 'Service', name: 'service', searchListMethod: 'searchServices' }),
	...dateFilters('solved', 'Solved'),
	{ displayName: 'Source ID', name: 'sourceID', type: 'string', default: '' },
	enumListFilter('Status', 'statuses', PROBLEM_STATUSES),
	{ displayName: 'Subject', name: 'subject', type: 'string', default: '', description: 'Exact subject (case-sensitive)' },
	...dateFilters('updated', 'Updated'),
];

export const problemDescription: INodeProperties[] = standardDescription({
	resource: 'problem',
	label: 'problem',
	plural: 'problems',
	searchListMethod: 'searchProblems',
	operations: ['create', 'get', 'getAll', 'update', 'addNote', 'getNotes', 'archive', 'trash', 'restore'],
	createFields: [
		{ displayName: 'Subject', name: 'subject', type: 'string', default: '', required: true },
		{ ...enumField('Impact', 'impact', IMPACTS, undefined, 'medium'), required: true },
		locatorField({ displayName: 'Service', name: 'service', searchListMethod: 'searchServices', required: true }),
		locatorField({ displayName: 'Team', name: 'team', searchListMethod: 'searchTeams', required: true }),
		locatorField({
			displayName: 'Manager',
			name: 'manager',
			searchListMethod: 'searchPeople',
			required: true,
			description: 'Problem manager responsible for the problem',
		}),
	],
	dataFields,
	filterFields,
	predefinedFilters: [
		'active',
		'known_errors',
		'progress_halted',
		'solved',
		'managed_by_me',
		'assigned_to_me',
		'assigned_to_my_team',
	],
});
