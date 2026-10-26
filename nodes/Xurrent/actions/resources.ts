import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	compact,
	type FieldKind,
	type FieldMap,
	type FilterKind,
	type FilterMap,
	requireRecordId,
	resolveRecordId,
	xurrentApiRequest,
	xurrentApiRequestAllItems,
} from '../GenericFunctions';
import { executeStandard, limitOf, type StandardRuntime } from './standard';

const plain = (api: string) => ({ api, kind: 'plain' as FieldKind });
const ref = (api: string) => ({ api, kind: 'reference' as FieldKind });
const refs = (api: string) => ({ api, kind: 'references' as FieldKind });
const time = (api: string) => ({ api, kind: 'timestamp' as FieldKind });

const eq = (api: string) => ({ api, kind: 'equals' as FilterKind });
const list = (api: string) => ({ api, kind: 'list' as FilterKind });
const byRef = (api: string) => ({ api, kind: 'reference' as FilterKind });
const bool = (api: string) => ({ api, kind: 'boolean' as FilterKind });
/** `<prefix>After` / `<prefix>Before` filters on a date field. */
const range = (prefix: string, api: string): FilterMap => ({
	[`${prefix}After`]: { api, kind: 'after' },
	[`${prefix}Before`]: { api, kind: 'before' },
});

const SOURCE_FIELDS: FieldMap = { source: plain('source'), sourceID: plain('sourceID') };
const COMMON_FILTERS: FilterMap = {
	sourceID: eq('sourceID'),
	...range('created', 'created_at'),
	...range('updated', 'updated_at'),
};

export const REQUEST: StandardRuntime = {
	collection: 'requests',
	label: 'request',
	fieldMap: {
		...SOURCE_FIELDS,
		subject: plain('subject'),
		category: plain('category'),
		requestedFor: ref('requested_for'),
		note: plain('note'),
		ci: ref('ci'),
		closureCode: plain('closure_code'),
		completionReason: plain('completion_reason'),
		desiredCompletionAt: time('desired_completion_at'),
		impact: plain('impact'),
		internalNote: plain('internal_note'),
		knowledgeArticle: ref('knowledge_article'),
		majorIncidentStatus: plain('major_incident_status'),
		member: ref('member'),
		plannedEffort: plain('planned_effort'),
		problem: ref('problem'),
		requestedBy: ref('requested_by'),
		reviewed: plain('reviewed'),
		rfcType: plain('rfc_type'),
		serviceInstance: ref('service_instance'),
		status: plain('status'),
		supplier: ref('supplier'),
		supplierRequestID: plain('supplier_requestID'),
		team: ref('team'),
		template: ref('template'),
		timeSpent: plain('time_spent'),
		urgent: plain('urgent'),
		waitingUntil: time('waiting_until'),
		workflow: ref('workflow'),
	},
	filterMap: {
		...COMMON_FILTERS,
		...range('completed', 'completed_at'),
		categories: list('category'),
		ci: byRef('ci'),
		impacts: list('impact'),
		majorIncidentStatuses: list('major_incident_status'),
		member: byRef('member'),
		organization: byRef('organization'),
		problem: byRef('problem'),
		requestedBy: byRef('requested_by'),
		requestedFor: byRef('requested_for'),
		serviceInstance: byRef('service_instance'),
		statuses: list('status'),
		subject: eq('subject'),
		team: byRef('team'),
		template: byRef('template'),
		workflow: byRef('workflow'),
	},
};

export const PROBLEM: StandardRuntime = {
	collection: 'problems',
	label: 'problem',
	fieldMap: {
		...SOURCE_FIELDS,
		subject: plain('subject'),
		impact: plain('impact'),
		service: ref('service'),
		team: ref('team'),
		manager: ref('manager'),
		analysisTargetAt: time('analysis_target_at'),
		category: plain('category'),
		completeRequests: plain('complete_requests'),
		customerResolution: plain('customer_resolution'),
		knowledgeArticle: ref('knowledge_article'),
		knownError: plain('known_error'),
		member: ref('member'),
		note: plain('note'),
		plannedEffort: plain('planned_effort'),
		resolution: plain('resolution'),
		status: plain('status'),
		supplier: ref('supplier'),
		supplierRequestID: plain('supplier_requestID'),
		timeSpent: plain('time_spent'),
		urgent: plain('urgent'),
		waitingUntil: time('waiting_until'),
		workaround: plain('workaround'),
		workflow: ref('workflow'),
	},
	filterMap: {
		...COMMON_FILTERS,
		...range('solved', 'solved_at'),
		impacts: list('impact'),
		service: byRef('service'),
		statuses: list('status'),
		subject: eq('subject'),
	},
};

export const WORKFLOW: StandardRuntime = {
	collection: 'workflows',
	label: 'workflow',
	retryWhileBeingCreated: true,
	fieldMap: {
		...SOURCE_FIELDS,
		subject: plain('subject'),
		template: ref('template'),
		workflowType: plain('workflow_type'),
		category: plain('category'),
		justification: plain('justification'),
		service: ref('service'),
		completionReason: plain('completion_reason'),
		manager: ref('manager'),
		note: plain('note'),
		preventRequestCompletion: plain('prevent_request_completion'),
		project: ref('project'),
		release: ref('release'),
		startAt: time('start_at'),
		status: plain('status'),
	},
	filterMap: {
		...COMMON_FILTERS,
		...range('completed', 'completed_at'),
		categories: list('category'),
		manager: byRef('manager'),
		service: byRef('service'),
		statuses: list('status'),
		subject: eq('subject'),
		template: byRef('template'),
	},
};

export const TASK: StandardRuntime = {
	collection: 'tasks',
	label: 'task',
	fieldMap: {
		...SOURCE_FIELDS,
		subject: plain('subject'),
		template: ref('template'),
		category: plain('category'),
		team: ref('team'),
		plannedDuration: plain('planned_duration'),
		copyNoteToRequest: plain('copy_note_to_request'),
		copyNoteToWorkflow: plain('copy_note_to_workflow'),
		impact: plain('impact'),
		instructions: plain('instructions'),
		member: ref('member'),
		note: plain('note'),
		plannedEffort: plain('planned_effort'),
		predecessors: refs('predecessor'),
		requiredApprovals: plain('required_approvals'),
		startAt: time('start_at'),
		status: plain('status'),
		successors: refs('successor'),
		supplier: ref('supplier'),
		timeSpent: plain('time_spent'),
		urgent: plain('urgent'),
		waitingUntil: time('waiting_until'),
	},
	filterMap: {
		...COMMON_FILTERS,
		...range('finished', 'finished_at'),
		categories: list('category'),
		impacts: list('impact'),
		member: byRef('member'),
		statuses: list('status'),
		subject: eq('subject'),
		team: byRef('team'),
		template: byRef('template'),
		workflow: byRef('workflow'),
	},
	createPath: (fields) => `workflows/${encodeURIComponent(resolveRecordId(fields.workflow) ?? '')}/tasks`,
	retryWhileBeingCreated: true,
};

export const CONFIGURATION_ITEM: StandardRuntime = {
	collection: 'cis',
	label: 'configuration item',
	fieldMap: {
		...SOURCE_FIELDS,
		product: ref('product'),
		status: plain('status'),
		supportTeam: ref('support_team'),
		assetID: plain('assetID'),
		financialOwner: ref('financial_owner'),
		label: plain('label'),
		name: plain('name'),
		remarks: plain('remarks'),
		serialNr: plain('serial_nr'),
		service: ref('service'),
		site: ref('site'),
		systemID: plain('systemID'),
		users: refs('user'),
	},
	filterMap: {
		...COMMON_FILTERS,
		assetID: eq('assetID'),
		label: eq('label'),
		name: eq('name'),
		product: byRef('product'),
		serialNr: eq('serial_nr'),
		service: byRef('service'),
		site: byRef('site'),
		statuses: list('status'),
		supportTeam: byRef('support_team'),
		systemID: eq('systemID'),
	},
};

export const PERSON: StandardRuntime = {
	collection: 'people',
	label: 'person',
	fieldMap: {
		...SOURCE_FIELDS,
		name: plain('name'),
		primaryEmail: plain('primary_email'),
		organization: ref('organization'),
		disabled: plain('disabled'),
		employeeID: plain('employeeID'),
		jobTitle: plain('job_title'),
		language: plain('language'),
		manager: ref('manager'),
		site: ref('site'),
		supportID: plain('supportID'),
		timeZone: plain('time_zone'),
	},
	filterMap: {
		...COMMON_FILTERS,
		disabled: bool('disabled'),
		employeeID: eq('employeeID'),
		manager: byRef('manager'),
		name: eq('name'),
		organization: byRef('organization'),
		primaryEmail: eq('primary_email'),
		site: byRef('site'),
		supportID: eq('supportID'),
	},
};

/** Top-level create parameters per resource (see createFields in the descriptions). */
export const CREATE_FIELDS: Record<string, string[]> = {
	request: ['subject', 'category', 'serviceInstance', 'requestedFor', 'note'],
	problem: ['subject', 'impact', 'service', 'team', 'manager'],
	workflow: ['subject', 'template', 'workflowType', 'category', 'justification', 'service'],
	task: ['workflow', 'subject', 'template', 'category', 'team', 'plannedDuration'],
	configurationItem: ['product', 'status', 'supportTeam'],
	person: ['name', 'primaryEmail', 'organization'],
};

export const RUNTIMES: Record<string, StandardRuntime> = {
	request: REQUEST,
	problem: PROBLEM,
	workflow: WORKFLOW,
	task: TASK,
	configurationItem: CONFIGURATION_ITEM,
	person: PERSON,
};

/** Resource specific operations; everything else is handled by executeStandard. */
async function executeSpecial(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[] | undefined> {
	if (resource === 'person' && operation === 'getMe') {
		return (await xurrentApiRequest.call(this, 'GET', 'me')) as IDataObject;
	}

	if (resource === 'workflow' && (operation === 'getTasks' || operation === 'getRequests')) {
		const id = requireRecordId.call(this, 'recordId', itemIndex, 'workflow');
		return xurrentApiRequestAllItems.call(
			this,
			`workflows/${encodeURIComponent(id)}/${operation === 'getTasks' ? 'tasks' : 'requests'}`,
			{},
			limitOf.call(this, itemIndex),
		);
	}

	if (resource === 'task') {
		if (operation === 'approve' || operation === 'reject') {
			const id = requireRecordId.call(this, 'recordId', itemIndex, 'task');
			const note = this.getNodeParameter('decisionNote', itemIndex, '') as string;
			if (operation === 'reject' && !note.trim()) {
				throw new NodeOperationError(this.getNode(), 'A note is required to reject an approval', { itemIndex });
			}
			const status = operation === 'approve' ? 'approved' : 'rejected';
			// The approver decides by setting the status of the approval task (developer.xurrent.com/v1/tasks/).
			const task = (await xurrentApiRequest.call(
				this,
				'PATCH',
				`tasks/${encodeURIComponent(id)}`,
				compact({ status, note }),
			)) as IDataObject;
			// Xurrent answers 200 but keeps the status when the task cannot be decided yet (verified live)
			if (task.status !== status) {
				throw new NodeOperationError(this.getNode(), `Xurrent did not ${operation} task ${id}`, {
					itemIndex,
					description: `The task is still "${String(task.status)}". Approval tasks can only be decided once they are assigned (the workflow has started), by one of their approvers.`,
				});
			}
			return task;
		}
		if (operation === 'getApprovals') {
			const id = requireRecordId.call(this, 'recordId', itemIndex, 'task');
			return xurrentApiRequestAllItems.call(
				this,
				`tasks/${encodeURIComponent(id)}/approvals`,
				{},
				limitOf.call(this, itemIndex),
			);
		}
		if (operation === 'addApprover') {
			const id = requireRecordId.call(this, 'recordId', itemIndex, 'task');
			const approver = requireRecordId.call(this, 'approver', itemIndex, 'approver');
			return (await xurrentApiRequest.call(this, 'POST', `tasks/${encodeURIComponent(id)}/approvals`, {
				approver_id: Number(approver),
			})) as IDataObject;
		}
	}

	return undefined;
}

export async function executeRecordResource(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const special = await executeSpecial.call(this, resource, operation, itemIndex);
	if (special !== undefined) return special;
	return executeStandard.call(this, RUNTIMES[resource], operation, itemIndex, CREATE_FIELDS[resource]);
}
