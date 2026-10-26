import type { INodePropertyOptions } from 'n8n-workflow';

/** Enum values as documented on developer.xurrent.com/v1 (field lists of each resource). */
export const REQUEST_CATEGORIES = [
	'incident',
	'rfc',
	'rfi',
	'reservation',
	'order',
	'fulfillment',
	'complaint',
	'compliment',
	'other',
];
export const REQUEST_STATUSES = [
	'declined',
	'on_backlog',
	'assigned',
	'accepted',
	'in_progress',
	'waiting_for',
	'waiting_for_customer',
	'reservation_pending',
	'workflow_pending',
	'project_pending',
	'completed',
];
export const REQUEST_IMPACTS = ['low', 'medium', 'high', 'top'];
export const REQUEST_COMPLETION_REASONS = [
	'solved',
	'workaround',
	'gone',
	'duplicate',
	'withdrawn',
	'no_reply',
	'rejected',
	'conflict',
	'declined',
	'unsolvable',
];
export const MAJOR_INCIDENT_STATUSES = ['proposed', 'rejected', 'accepted', 'resolved', 'canceled'];

export const IMPACTS = ['none', 'low', 'medium', 'high', 'top'];

export const PROBLEM_STATUSES = [
	'declined',
	'assigned',
	'accepted',
	'in_progress',
	'waiting_for',
	'analyzed',
	'change_requested',
	'workflow_pending',
	'on_backlog',
	'project_pending',
	'progress_halted',
	'solved',
];
export const PROBLEM_CATEGORIES = ['reactive', 'proactive'];

export const WORKFLOW_CATEGORIES = ['standard', 'non_standard', 'emergency', 'order'];
export const WORKFLOW_JUSTIFICATIONS = [
	'compliance',
	'correction',
	'expansion',
	'improvement',
	'maintenance',
	'move',
	'removal',
	'replacement',
	'purchase',
];
export const WORKFLOW_STATUSES = ['being_created', 'registered', 'in_progress', 'progress_halted', 'completed'];
export const WORKFLOW_COMPLETION_REASONS = [
	'withdrawn',
	'rejected',
	'rolled_back',
	'failed',
	'partial',
	'disruptive',
	'complete',
];

export const TASK_CATEGORIES = ['risk_and_impact', 'approval', 'implementation', 'automation'];
export const TASK_STATUSES = [
	'registered',
	'declined',
	'assigned',
	'accepted',
	'in_progress',
	'waiting_for',
	'waiting_for_customer',
	'request_pending',
	'failed',
	'rejected',
	'completed',
	'approved',
	'canceled',
];

export const CI_STATUSES = [
	'ordered',
	'being_built',
	'in_stock',
	'reserved',
	'in_transit',
	'installed',
	'being_tested',
	'standby_for_continuity',
	'lent_out',
	'in_production',
	'undergoing_maintenance',
	'broken_down',
	'being_repaired',
	'archived',
	'to_be_removed',
	'lost_or_stolen',
	'removed',
];

const LABEL_OVERRIDES: Record<string, string> = {
	rfc: 'RFC (Request for Change)',
	rfi: 'RFI (Request for Information)',
	non_standard: 'Non-Standard',
	risk_and_impact: 'Risk & Impact',
};

/** Human readable label for an enum value: waiting_for_customer → Waiting for Customer. */
export function enumLabel(value: string): string {
	if (LABEL_OVERRIDES[value]) return LABEL_OVERRIDES[value];
	const small = new Set(['for', 'or', 'of', 'to', 'and', 'by']);
	return value
		.split('_')
		.map((word, index) => (index > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
		.join(' ');
}

export function enumOptions(values: string[]): INodePropertyOptions[] {
	return values.map((value) => ({ name: enumLabel(value), value }));
}

/**
 * Collections of the REST API offered for the generic Record resource and the record locator.
 * Any other collection path can be entered by hand.
 */
export const COLLECTIONS: Array<{ name: string; value: string }> = [
	{ name: 'Affected SLAs', value: 'affected_slas' },
	{ name: 'Agile Boards', value: 'agile_boards' },
	{ name: 'Broadcasts', value: 'broadcasts' },
	{ name: 'Calendars', value: 'calendars' },
	{ name: 'Closure Codes', value: 'closure_codes' },
	{ name: 'Configuration Items', value: 'cis' },
	{ name: 'Contracts', value: 'contracts' },
	{ name: 'Custom Collection Elements', value: 'custom_collection_elements' },
	{ name: 'Custom Collections', value: 'custom_collections' },
	{ name: 'Effort Classes', value: 'effort_classes' },
	{ name: 'First Line Support Agreements', value: 'first_line_support_agreements' },
	{ name: 'Holidays', value: 'holidays' },
	{ name: 'Invoices', value: 'invoices' },
	{ name: 'Knowledge Article Templates', value: 'knowledge_article_templates' },
	{ name: 'Knowledge Articles', value: 'knowledge_articles' },
	{ name: 'Notes', value: 'notes' },
	{ name: 'Organizations', value: 'organizations' },
	{ name: 'Out of Office Periods', value: 'out_of_office_periods' },
	{ name: 'People', value: 'people' },
	{ name: 'Problems', value: 'problems' },
	{ name: 'Product Categories', value: 'product_categories' },
	{ name: 'Products', value: 'products' },
	{ name: 'Project Tasks', value: 'project_tasks' },
	{ name: 'Project Templates', value: 'project_templates' },
	{ name: 'Projects', value: 'projects' },
	{ name: 'Releases', value: 'releases' },
	{ name: 'Request Templates', value: 'request_templates' },
	{ name: 'Requests', value: 'requests' },
	{ name: 'Reservations', value: 'reservations' },
	{ name: 'RFC Types', value: 'rfc_types' },
	{ name: 'Risks', value: 'risks' },
	{ name: 'Service Categories', value: 'service_categories' },
	{ name: 'Service Instances', value: 'service_instances' },
	{ name: 'Service Level Agreements', value: 'service_level_agreements' },
	{ name: 'Service Offerings', value: 'service_offerings' },
	{ name: 'Services', value: 'services' },
	{ name: 'Shop Articles', value: 'shop_articles' },
	{ name: 'Shop Order Lines', value: 'shop_order_lines' },
	{ name: 'Sites', value: 'sites' },
	{ name: 'Skill Pools', value: 'skill_pools' },
	{ name: 'Surveys', value: 'surveys' },
	{ name: 'Task Templates', value: 'task_templates' },
	{ name: 'Tasks', value: 'tasks' },
	{ name: 'Teams', value: 'teams' },
	{ name: 'Time Allocations', value: 'time_allocations' },
	{ name: 'Time Entries', value: 'time_entries' },
	{ name: 'Timesheets', value: 'timesheets' },
	{ name: 'UI Extensions', value: 'ui_extensions' },
	{ name: 'Webhook Policies', value: 'webhook_policies' },
	{ name: 'Webhooks', value: 'webhooks' },
	{ name: 'Workflow Templates', value: 'workflow_templates' },
	{ name: 'Workflow Types', value: 'workflow_types' },
	{ name: 'Workflows', value: 'workflows' },
];

/** Webhook event prefix → API collection, used by the trigger to fetch the record of an event. */
export const EVENT_COLLECTIONS: Record<string, string> = {
	app_instance: 'app_instances',
	broadcast: 'broadcasts',
	ci: 'cis',
	contract: 'contracts',
	flsa: 'first_line_support_agreements',
	knowledge_article: 'knowledge_articles',
	organization: 'organizations',
	out_of_office_period: 'out_of_office_periods',
	person: 'people',
	problem: 'problems',
	product: 'products',
	project: 'projects',
	project_task: 'project_tasks',
	release: 'releases',
	request: 'requests',
	risk: 'risks',
	service: 'services',
	service_instance: 'service_instances',
	service_offering: 'service_offerings',
	sla: 'service_level_agreements',
	task: 'tasks',
	team: 'teams',
	time_entry: 'time_entries',
	workflow: 'workflows',
};

/** Webhook events (https://developer.xurrent.com/v1/webhooks/events/), except webhook.verify. */
export const WEBHOOK_EVENTS = [
	'app_instance.create',
	'app_instance.delete',
	'app_instance.secrets-update',
	'app_instance.update',
	'automation_rule',
	'broadcast.create',
	'broadcast.update',
	'ci.create',
	'ci.update',
	'contract.create',
	'contract.update',
	'flsa.create',
	'flsa.update',
	'knowledge_article.create',
	'knowledge_article.update',
	'organization.create',
	'organization.update',
	'out_of_office_period.create',
	'out_of_office_period.delete',
	'out_of_office_period.update',
	'person.create',
	'person.update',
	'problem.create',
	'problem.manager-changed',
	'problem.member-changed',
	'problem.note-added',
	'problem.status-changed',
	'problem.team-changed',
	'problem.update',
	'product.create',
	'product.update',
	'project.create',
	'project.manager-changed',
	'project.note-added',
	'project.status-changed',
	'project.update',
	'project_task.create',
	'project_task.note-added',
	'project_task.status-changed',
	'project_task.update',
	'release.create',
	'release.manager-changed',
	'release.note-added',
	'release.update',
	'request.agile-board-column-changed',
	'request.create',
	'request.major-incident-status-changed',
	'request.member-changed',
	'request.note-added',
	'request.status-changed',
	'request.team-changed',
	'request.update',
	'risk.create',
	'risk.manager-changed',
	'risk.note-added',
	'risk.status-changed',
	'risk.update',
	'service.create',
	'service.update',
	'service_instance.create',
	'service_instance.update',
	'service_offering.create',
	'service_offering.update',
	'sla.create',
	'sla.update',
	'task.create',
	'task.member-changed',
	'task.note-added',
	'task.status-changed',
	'task.team-changed',
	'task.update',
	'team.create',
	'team.update',
	'time_entry.create',
	'time_entry.delete',
	'time_entry.update',
	'workflow.create',
	'workflow.manager-changed',
	'workflow.note-added',
	'workflow.status-changed',
	'workflow.update',
];

const EVENT_NOUNS: Record<string, string> = {
	app_instance: 'App Instance',
	ci: 'Configuration Item',
	flsa: 'First Line Support Agreement',
	sla: 'SLA',
};

/** request.status-changed → "Request: Status Changed" */
export function eventLabel(event: string): string {
	const [noun, verb] = event.split('.');
	const nounLabel = EVENT_NOUNS[noun] ?? enumLabel(noun);
	if (!verb) return `${nounLabel} (Triggered by an Automation Rule)`;
	const verbLabel = verb
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
		.replace(/^Create$/, 'Created')
		.replace(/^Update$/, 'Updated')
		.replace(/^Delete$/, 'Deleted');
	return `${nounLabel}: ${verbLabel}`;
}
