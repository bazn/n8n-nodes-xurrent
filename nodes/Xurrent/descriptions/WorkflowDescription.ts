import type { INodeProperties } from 'n8n-workflow';

import { WORKFLOW_CATEGORIES, WORKFLOW_COMPLETION_REASONS, WORKFLOW_JUSTIFICATIONS, WORKFLOW_STATUSES } from '../constants';
import { customFieldsField, dateFilters, enumField, enumListFilter, extraFieldsField, locatorField, op, returnAllFields } from './shared';
import { standardDescription } from './standard';

const dataFields: INodeProperties[] = [
	enumField('Completion Reason', 'completionReason', WORKFLOW_COMPLETION_REASONS),
	customFieldsField,
	extraFieldsField,
	locatorField({
		displayName: 'Manager',
		name: 'manager',
		searchListMethod: 'searchPeople',
		description: 'Workflow manager. Defaults to the person the API token belongs to.',
	}),
	{
		displayName: 'Note',
		name: 'note',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
	},
	{
		displayName: 'Prevent Request Completion',
		name: 'preventRequestCompletion',
		type: 'boolean',
		default: false,
		description: 'Whether linked requests stay open when the workflow is completed',
	},
	{ displayName: 'Project ID', name: 'project', type: 'string', default: '' },
	{ displayName: 'Release ID', name: 'release', type: 'string', default: '' },
	{ displayName: 'Source', name: 'source', type: 'string', default: '' },
	{ displayName: 'Source ID', name: 'sourceID', type: 'string', default: '' },
	{
		displayName: 'Start',
		name: 'startAt',
		type: 'dateTime',
		default: '',
		description: 'When the first tasks are set to Assigned',
	},
	enumField('Status', 'status', WORKFLOW_STATUSES),
];

const filterFields: INodeProperties[] = [
	enumListFilter('Category', 'categories', WORKFLOW_CATEGORIES),
	...dateFilters('completed', 'Completed'),
	...dateFilters('created', 'Created'),
	locatorField({ displayName: 'Manager', name: 'manager', searchListMethod: 'searchPeople' }),
	locatorField({ displayName: 'Service', name: 'service', searchListMethod: 'searchServices' }),
	{ displayName: 'Source ID', name: 'sourceID', type: 'string', default: '' },
	enumListFilter('Status', 'statuses', WORKFLOW_STATUSES),
	{ displayName: 'Subject', name: 'subject', type: 'string', default: '', description: 'Exact subject (case-sensitive)' },
	locatorField({ displayName: 'Template', name: 'template', searchListMethod: 'searchWorkflowTemplates' }),
	...dateFilters('updated', 'Updated'),
];

export const workflowDescription: INodeProperties[] = [
	...standardDescription({
		resource: 'workflow',
		label: 'workflow',
		plural: 'workflows',
		searchListMethod: 'searchWorkflows',
		operations: ['create', 'get', 'getAll', 'update', 'addNote', 'getNotes', 'archive', 'trash', 'restore'],
		extraOperations: [
			op('Get Requests', 'getRequests', 'Get the requests linked to a workflow'),
			op('Get Tasks', 'getTasks', 'Get the tasks of a workflow'),
		],
		extraIdOperations: ['getRequests', 'getTasks'],
		createFields: [
			{ displayName: 'Subject', name: 'subject', type: 'string', default: '', required: true },
			locatorField({
				displayName: 'Template',
				name: 'template',
				searchListMethod: 'searchWorkflowTemplates',
				required: true,
				description: 'Workflow template whose tasks are created',
			}),
			{
				displayName: 'Workflow Type Name or ID',
				name: 'workflowType',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWorkflowTypes' },
				default: '',
				required: true,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{ ...enumField('Category', 'category', WORKFLOW_CATEGORIES, undefined, 'standard'), required: true },
			{ ...enumField('Justification', 'justification', WORKFLOW_JUSTIFICATIONS, undefined, 'improvement'), required: true },
			locatorField({ displayName: 'Service', name: 'service', searchListMethod: 'searchServices', required: true }),
		],
		dataFields,
		filterFields,
		predefinedFilters: ['open', 'completed', 'managed_by_me'],
	}),
	...returnAllFields({ show: { resource: ['workflow'], operation: ['getRequests', 'getTasks'] } }),
];
