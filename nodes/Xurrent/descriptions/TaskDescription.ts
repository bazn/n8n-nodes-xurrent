import type { INodeProperties } from 'n8n-workflow';

import { IMPACTS, TASK_CATEGORIES, TASK_STATUSES } from '../constants';
import { customFieldsField, dateFilters, enumField, enumListFilter, extraFieldsField, locatorField, op, returnAllFields } from './shared';
import { standardDescription } from './standard';

const dataFields: INodeProperties[] = [
	{
		displayName: 'Copy Note to Request',
		name: 'copyNoteToRequest',
		type: 'boolean',
		default: false,
		description: 'Whether the note is also added to the request linked to the workflow',
	},
	{
		displayName: 'Copy Note to Workflow',
		name: 'copyNoteToWorkflow',
		type: 'boolean',
		default: false,
	},
	customFieldsField,
	extraFieldsField,
	enumField('Impact', 'impact', IMPACTS),
	{
		displayName: 'Instructions',
		name: 'instructions',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
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
		displayName: 'Predecessor Task IDs',
		name: 'predecessors',
		type: 'string',
		default: '',
		description: 'Comma-separated IDs of the tasks this task follows',
	},
	{
		displayName: 'Required Approvals',
		name: 'requiredApprovals',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 1,
		description: 'Number of approvers who must approve an approval task',
	},
	{ displayName: 'Source', name: 'source', type: 'string', default: '' },
	{ displayName: 'Source ID', name: 'sourceID', type: 'string', default: '' },
	{ displayName: 'Start', name: 'startAt', type: 'dateTime', default: '' },
	enumField('Status', 'status', TASK_STATUSES),
	{
		displayName: 'Successor Task IDs',
		name: 'successors',
		type: 'string',
		default: '',
		description: 'Comma-separated IDs of the tasks that follow this task',
	},
	locatorField({ displayName: 'Supplier', name: 'supplier', searchListMethod: 'searchOrganizations' }),
	{ displayName: 'Time Spent (Minutes)', name: 'timeSpent', type: 'number', typeOptions: { minValue: 0 }, default: 0 },
	{ displayName: 'Urgent', name: 'urgent', type: 'boolean', default: false },
	{
		displayName: 'Waiting Until',
		name: 'waitingUntil',
		type: 'dateTime',
		default: '',
		description: 'Only when the status is Waiting For',
	},
];

const filterFields: INodeProperties[] = [
	enumListFilter('Category', 'categories', TASK_CATEGORIES),
	...dateFilters('created', 'Created'),
	...dateFilters('finished', 'Finished'),
	enumListFilter('Impact', 'impacts', IMPACTS),
	locatorField({ displayName: 'Member (Assignee)', name: 'member', searchListMethod: 'searchPeople' }),
	{ displayName: 'Source ID', name: 'sourceID', type: 'string', default: '' },
	enumListFilter('Status', 'statuses', TASK_STATUSES),
	{ displayName: 'Subject', name: 'subject', type: 'string', default: '', description: 'Exact subject (case-sensitive)' },
	locatorField({ displayName: 'Team', name: 'team', searchListMethod: 'searchTeams' }),
	locatorField({ displayName: 'Template', name: 'template', searchListMethod: 'searchTaskTemplates' }),
	...dateFilters('updated', 'Updated'),
	locatorField({ displayName: 'Workflow', name: 'workflow', searchListMethod: 'searchWorkflows' }),
];

const show = (operation: string[]) => ({ show: { resource: ['task'], operation } });

export const taskDescription: INodeProperties[] = [
	...standardDescription({
		resource: 'task',
		label: 'task',
		plural: 'tasks',
		searchListMethod: 'searchTasks',
		operations: ['create', 'get', 'getAll', 'update', 'addNote', 'getNotes'],
		extraOperations: [
			op('Add Approver', 'addApprover', 'Add an approver to an approval task'),
			op('Approve', 'approve', 'Approve an approval task'),
			op('Get Approvals', 'getApprovals', 'Get the approvals of an approval task'),
			op('Reject', 'reject', 'Reject an approval task'),
		],
		extraIdOperations: ['addApprover', 'approve', 'getApprovals', 'reject'],
		createOnlyFields: ['workflow'],
		createFields: [
			locatorField({
				displayName: 'Workflow',
				name: 'workflow',
				searchListMethod: 'searchWorkflows',
				required: true,
				description: 'Workflow the task is added to',
			}),
			{ displayName: 'Subject', name: 'subject', type: 'string', default: '', required: true },
			locatorField({ displayName: 'Template', name: 'template', searchListMethod: 'searchTaskTemplates', required: true }),
			{ ...enumField('Category', 'category', TASK_CATEGORIES, undefined, 'implementation'), required: true },
			locatorField({ displayName: 'Team', name: 'team', searchListMethod: 'searchTeams', required: true }),
			{
				displayName: 'Planned Duration (Minutes)',
				name: 'plannedDuration',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 60,
				required: true,
			},
		],
		dataFields,
		filterFields,
		predefinedFilters: ['open', 'finished', 'assigned_to_me', 'assigned_to_my_team', 'managed_by_me', 'approval_by_me'],
	}),
	{
		displayName: 'Note',
		name: 'decisionNote',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'Reason for the decision, added as note to the task. Xurrent requires a note when rejecting.',
		displayOptions: show(['approve', 'reject']),
	},
	locatorField({
		displayName: 'Approver',
		name: 'approver',
		searchListMethod: 'searchPeople',
		required: true,
		displayOptions: show(['addApprover']),
	}),
	...returnAllFields(show(['getApprovals'])),
];
