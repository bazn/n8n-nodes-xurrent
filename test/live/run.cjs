// Live end-to-end tests against a real Xurrent account (use a QA or demo account).
//   npm run test:live            reads credentials from .env (see harness.cjs)
// Creates records prefixed with "[n8n-test]" and completes them again at the end.
const { run, method, hook, webhook, rl, asTrigger, getLog, httpRequestWithAuthentication, credentials } = require('./harness.cjs');

const results = [];
const assert = (cond, msg) => {
	if (!cond) throw new Error(msg);
};
const short = (o) => JSON.stringify(o).slice(0, 160);

async function step(name, fn) {
	try {
		const value = await fn();
		results.push(true);
		console.log(`PASS ${name}`);
		return value;
	} catch (error) {
		results.push(false);
		const body = error.response?.body ?? error.cause?.response?.body;
		console.log(`FAIL ${name}: ${error.message}${error.description ? ' | ' + error.description : ''}`);
		if (body) console.log('     body:', short(body));
		console.log('     requests:', getLog().join(' | '));
		return undefined;
	}
}

/** Raw API call, to check results independently of the node. */
async function api(method, endpoint, qs) {
	return httpRequestWithAuthentication('xurrentApi', {
		method,
		url: `https://${credentials.environment}/v1/${endpoint}`,
		qs,
		json: true,
	});
}

(async () => {
	console.log(`Account ${credentials.account} on ${credentials.environment}\n`);

	// ------------------------------------------------ lookups
	const lists = {};
	for (const [name, filter] of [
		['searchTeams', ''],
		['searchPeople', ''],
		['searchOrganizations', ''],
		['searchSites', ''],
		['searchServices', ''],
		['searchServices', 'a'],
		['searchServiceInstances', ''],
		['searchRequestTemplates', ''],
		['searchRequests', ''],
		['searchRequests', 'password'],
		['searchProblems', ''],
		['searchWorkflows', ''],
		['searchTasks', ''],
		['searchCis', ''],
		['searchProducts', ''],
		['searchWorkflowTemplates', ''],
		['searchTaskTemplates', ''],
		['searchKnowledgeArticles', 'a'],
		['searchCollections', 'team'],
	]) {
		await step(`listSearch ${name}${filter ? ` "${filter}"` : ''}`, async () => {
			const result = await method('listSearch', name, filter);
			assert(Array.isArray(result.results), 'no results array');
			if (!filter) lists[name] = result.results;
			return result;
		});
	}
	const firstTeam = lists.searchTeams?.[0];
	await step('listSearch searchTeams with client-side filter', async () => {
		const term = firstTeam.name.slice(0, 4);
		const result = await method('listSearch', 'searchTeams', term);
		assert(result.results.some((r) => r.value === firstTeam.value), `"${term}" did not find ${firstTeam.name}`);
	});
	await step('listSearch pagination token', async () => {
		const first = lists.searchPeople;
		assert(first.length > 0, 'no people');
		const page1 = await method('listSearch', 'searchPeople', '');
		if (!page1.paginationToken) return 'single page';
		const page2 = await method('listSearch', 'searchPeople', '', page1.paginationToken);
		assert(page2.results.length > 0 && page2.results[0].value !== page1.results[0].value, 'page 2 equals page 1');
	});
	for (const name of ['getWorkflowTypes', 'getClosureCodes', 'getRfcTypes']) {
		await step(`loadOptions ${name}`, async () => {
			const options = await method('loadOptions', name);
			assert(Array.isArray(options), 'not an array');
			console.log(`     ${options.length} options, e.g. ${short(options.slice(0, 2))}`);
		});
	}

	// ------------------------------------------------ people
	const me = await step('person getMe', async () => {
		const [person] = await run({ resource: 'person', operation: 'getMe' });
		assert(person.id, 'no id');
		return person;
	});
	await step('listSearch searchPeople by email', async () => {
		const result = await method('listSearch', 'searchPeople', me.primary_email);
		assert(result.results.some((r) => r.value === String(me.id)), 'me not found by email');
	});
	await step('person getAll filter primaryEmail', async () => {
		const rows = await run({
			resource: 'person', operation: 'getAll', returnAll: false, limit: 5, predefinedFilter: 'all',
			filters: { primaryEmail: me.primary_email.toUpperCase() }, options: {},
		});
		assert(rows.length === 1 && rows[0].id === me.id, `got ${short(rows)}`);
	});
	await step('person getAll reference filter organization (organization_id)', async () => {
		const rows = await run({
			resource: 'person', operation: 'getAll', returnAll: false, limit: 10, predefinedFilter: 'enabled',
			filters: { organization: rl(me.organization.id) }, options: { fields: 'name,organization' },
		});
		assert(rows.length > 0, 'no rows');
		assert(rows.every((r) => r.organization?.id === me.organization.id), `foreign organization in ${short(rows)}`);
	});
	await step('person get by URL', async () => {
		const [person] = await run({
			resource: 'person', operation: 'get', recordId: rl(`https://${credentials.account}.xurrent.com/people/${me.id}`, 'url'),
			getOptions: {},
		});
		assert(person.id === me.id, 'wrong person');
	});

	// ------------------------------------------------ requests: filters
	const teamId = Number(firstTeam?.value);
	await step('request getAll open, filter team (team_id) + statuses', async () => {
		const rows = await run({
			resource: 'request', operation: 'getAll', returnAll: false, limit: 30, predefinedFilter: 'open',
			filters: { team: rl(teamId), statuses: ['assigned', 'accepted', 'in_progress'] }, options: {},
		});
		console.log(`     ${rows.length} rows`);
		assert(rows.every((r) => r.team?.id === teamId), `foreign team in ${short(rows.map((r) => r.team))}`);
		assert(rows.every((r) => ['assigned', 'accepted', 'in_progress'].includes(r.status)), 'wrong status');
	});
	await step('request getAll returnAll with created range (pagination over 100)', async () => {
		const rows = await run({
			resource: 'request', operation: 'getAll', returnAll: true, predefinedFilter: 'all',
			filters: { createdAfter: '2000-01-01T00:00:00Z' }, options: { fields: 'id' },
		});
		const total = await api('GET', 'requests', { per_page: 1, fields: 'id', created_at: '>2000-01-01T00:00:00Z' });
		console.log(`     ${rows.length} requests read`);
		assert(rows.length > 100 || Array.isArray(total), 'expected more than one page');
		assert(new Set(rows.map((r) => r.id)).size === rows.length, 'duplicates across pages');
	});
	await step('request getAll sort + fields + custom query', async () => {
		const rows = await run({
			resource: 'request', operation: 'getAll', returnAll: false, limit: 5, predefinedFilter: 'all', filters: {},
			options: { fields: 'subject,created_at', sort: 'created_at', customQuery: { parameter: [{ name: 'category', value: 'incident,rfi' }] } },
		});
		assert(rows.length > 0, 'no rows');
		const dates = rows.map((r) => r.created_at);
		assert([...dates].sort().join() === dates.join(), 'not ascending');
	});

	// ------------------------------------------------ requests: lifecycle
	const request = await step('request create', async () => {
		const [created] = await run({
			resource: 'request', operation: 'create', subject: '[n8n-test] Live test request', category: 'rfi',
			serviceInstance: rl(lists.searchServiceInstances[0].value), requestedFor: rl(me.id), note: 'Created by the n8n node live tests - safe to complete',
			additionalFields: { team: rl(teamId), impact: 'low', source: 'n8n', sourceID: `n8n-${Date.now()}` },
		});
		assert(created.id && created.subject.includes('[n8n-test]'), short(created));
		return created;
	});
	if (request) {
		const recordId = rl(request.id);
		await step('request get', async () => {
			const [got] = await run({ resource: 'request', operation: 'get', recordId, getOptions: {} });
			assert(got.id === request.id && got.team?.id === teamId, short(got));
		});
		await step('request update (member, internal note, desired completion)', async () => {
			const [updated] = await run({
				resource: 'request', operation: 'update', recordId,
				updateFields: { member: rl(me.id), internalNote: 'internal from n8n', desiredCompletionAt: '2030-01-01T10:00:00+01:00', status: 'accepted' },
			});
			assert(updated.member?.id === me.id && updated.status === 'accepted', short(updated));
			console.log(`     desired_completion_at = ${updated.desired_completion_at}`);
		});
		await step('request addNote (public)', async () => {
			const [note] = await run({ resource: 'request', operation: 'addNote', recordId, noteText: 'Public note from n8n', noteOptions: {} });
			assert(note.id, short(note));
		});
		const keys = await step('attachment upload', async () => {
			const [uploaded] = await run(
				{ resource: 'attachment', operation: 'upload', binaryPropertyName: 'data' },
				{ binary: { data: { data: Buffer.from('hello from n8n').toString('base64'), fileName: 'n8n-test.txt', mimeType: 'text/plain' } } },
			);
			assert(uploaded.key, short(uploaded));
			console.log(`     provider ${uploaded.provider}, key ${uploaded.key}`);
			return uploaded;
		});
		await step('request addNote (internal, with attachment)', async () => {
			const [note] = await run({
				resource: 'request', operation: 'addNote', recordId, noteText: 'Internal note with attachment',
				noteOptions: { internal: true, attachmentKeys: keys?.key ?? '' },
			});
			assert(note.id, short(note));
		});
		const notes = await step('request getNotes (all / internal / public)', async () => {
			const all = await run({ resource: 'request', operation: 'getNotes', recordId, returnAll: true, noteVisibility: 'all' });
			const internal = await run({ resource: 'request', operation: 'getNotes', recordId, returnAll: true, noteVisibility: 'internal' });
			const pub = await run({ resource: 'request', operation: 'getNotes', recordId, returnAll: true, noteVisibility: 'public' });
			console.log(`     all ${all.length}, internal ${internal.length}, public ${pub.length}`);
			assert(all.length >= 3 && internal.length >= 1 && pub.length >= 2, 'unexpected note counts');
			return all;
		});
		await step('attachment download from note', async () => {
			const withAttachment = (notes ?? []).find((note) => (note.attachments ?? []).length);
			assert(withAttachment, 'no note with attachment');
			const [item] = await run(
				{ resource: 'attachment', operation: 'download', attachmentUrl: withAttachment.attachments[0].uri, outputBinaryPropertyName: 'data', fileName: '' },
				{ raw: true },
			);
			const text = Buffer.from(item.binary.data.data, 'base64').toString('utf8');
			assert(text === 'hello from n8n', `content "${text.slice(0, 40)}"`);
		});
		await step('request getAll filter sourceID finds the new request', async () => {
			const rows = await run({
				resource: 'request', operation: 'getAll', returnAll: false, limit: 5, predefinedFilter: 'all',
				filters: { sourceID: request.sourceID ?? '' , requestedFor: rl(me.id) }, options: {},
			});
			assert(rows.some((r) => r.id === request.id), `not found: ${short(rows)}`);
		});
		await step('record (any collection) get + custom API call', async () => {
			const [got] = await run({ resource: 'record', operation: 'get', collection: rl('requests', 'list'), recordPathId: String(request.id), getOptions: { fields: 'subject' } });
			assert(got.subject?.includes('[n8n-test]'), short(got));
			const [limit] = await run({ resource: 'record', operation: 'request', method: 'GET', path: 'rate_limit', query: '{}', requestBody: '{}', readAllPages: false });
			assert(limit && typeof limit === 'object', short(limit));
		});
		await step('request complete (update status completed)', async () => {
			const [done] = await run({
				resource: 'request', operation: 'update', recordId,
				updateFields: { status: 'completed', completionReason: 'solved', note: 'Completed by the n8n live tests' },
			});
			assert(done.status === 'completed', short(done));
		});
	}
	await step('request update without fields fails cleanly', async () => {
		try {
			await run({ resource: 'request', operation: 'update', recordId: rl(request?.id ?? 1), updateFields: {} });
		} catch (error) {
			assert(/at least one field/.test(error.message), error.message);
			return;
		}
		throw new Error('no error');
	});
	await step('validation errors are readable', async () => {
		try {
			await run({ resource: 'request', operation: 'create', subject: '', category: 'incident', serviceInstance: rl(''), requestedFor: rl(''), note: '', additionalFields: {} });
		} catch (error) {
			console.log(`     ${error.message} | ${error.description}`);
			assert(error.message && error.message !== 'Request failed with status code 422', 'raw message');
			return;
		}
		throw new Error('no error');
	});

	// ------------------------------------------------ other resources (read)
	for (const [resource, predefinedFilter, filters] of [
		['problem', 'active', {}],
		['workflow', 'open', {}],
		['task', 'open', { categories: ['approval', 'implementation'] }],
		['configurationItem', 'active', { statuses: ['in_production'] }],
	]) {
		await step(`${resource} getAll ${predefinedFilter}`, async () => {
			const rows = await run({ resource, operation: 'getAll', returnAll: false, limit: 5, predefinedFilter, filters, options: {} });
			console.log(`     ${rows.length} rows`);
			if (rows[0]) {
				const [got] = await run({ resource, operation: 'get', recordId: rl(rows[0].id), getOptions: {} });
				assert(got.id === rows[0].id, 'get returned another record');
			}
		});
	}
	await step('workflow getTasks / getRequests', async () => {
		const workflow = lists.searchWorkflows?.[0];
		if (!workflow) return 'no workflow';
		const tasks = await run({ resource: 'workflow', operation: 'getTasks', recordId: rl(workflow.value), returnAll: true });
		const requests = await run({ resource: 'workflow', operation: 'getRequests', recordId: rl(workflow.value), returnAll: true });
		console.log(`     ${tasks.length} tasks, ${requests.length} requests`);
	});
	await step('task getApprovals of an approval task', async () => {
		const rows = await run({ resource: 'task', operation: 'getAll', returnAll: false, limit: 1, predefinedFilter: 'all', filters: { categories: ['approval'] }, options: {} });
		if (!rows[0]) return 'no approval task';
		const approvals = await run({ resource: 'task', operation: 'getApprovals', recordId: rl(rows[0].id), returnAll: true });
		console.log(`     ${approvals.length} approvals, e.g. ${short(approvals[0] ?? {})}`);
	});
	// ------------------------------------------------ workflows and approvals on own test data
	const workflow = await step('workflow create from template', async () => {
		const template = lists.searchWorkflowTemplates?.[0];
		assert(template, 'no workflow template');
		const details = await api('GET', `workflow_templates/${template.value}`);
		const types = await method('loadOptions', 'getWorkflowTypes');
		const serviceId = details.service?.id ?? Number(lists.searchServices?.[0]?.value);
		const [created] = await run({
			resource: 'workflow', operation: 'create', subject: '[n8n-test] Live test workflow',
			template: rl(template.value), workflowType: details.workflow_type ?? types[0].value,
			category: details.category ?? 'standard', justification: details.justification ?? 'improvement',
			service: rl(serviceId),
			additionalFields: { manager: rl(me.id), note: 'Created by the n8n live tests', startAt: new Date().toISOString() },
		});
		assert(created.id && created.subject.includes('[n8n-test]'), short(created));
		return created;
	});
	const approvalTask = workflow && await step('task create (approval) in workflow', async () => {
		const template = (await api('GET', 'task_templates', { per_page: 100, category: 'approval' }))[0];
		assert(template, 'no approval task template');
		const [task] = await run({
			resource: 'task', operation: 'create', workflow: rl(workflow.id), subject: '[n8n-test] Approval',
			template: rl(template.id), category: 'approval', team: rl(teamId), plannedDuration: 10,
			additionalFields: { requiredApprovals: 1 },
		});
		assert(task.id && task.category === 'approval', short(task));
		return task;
	});
	if (approvalTask) {
		await step('task addApprover + getApprovals', async () => {
			const before = await run({ resource: 'task', operation: 'getApprovals', recordId: rl(approvalTask.id), returnAll: true });
			// the task template may already list the user as approver, and approvers must be unique
			if (!before.some((a) => a.approver?.id === me.id)) {
				await run({ resource: 'task', operation: 'addApprover', recordId: rl(approvalTask.id), approver: rl(me.id) });
			}
			const approvals = await run({ resource: 'task', operation: 'getApprovals', recordId: rl(approvalTask.id), returnAll: true });
			assert(approvals.some((a) => a.approver?.id === me.id), short(approvals));
		});
		await step('task reject without note fails cleanly', async () => {
			try {
				await run({ resource: 'task', operation: 'reject', recordId: rl(approvalTask.id), decisionNote: '' });
			} catch (error) {
				assert(/note is required/.test(error.message), error.message);
				return;
			}
			throw new Error('no error');
		});
		await step('task approve (PATCH status approved)', async () => {
			for (let i = 0; i < 10; i++) {
				const [current] = await run({ resource: 'task', operation: 'get', recordId: rl(approvalTask.id), getOptions: {} });
				console.log(`     task status before approve: ${current.status}`);
				if (current.status !== 'registered') break;
				await new Promise((resolve) => setTimeout(resolve, 3000));
			}
			const [task] = await run({ resource: 'task', operation: 'approve', recordId: rl(approvalTask.id), decisionNote: 'Approved by the n8n live tests' });
			console.log(`     task status ${task.status}`);
			assert(task.status === 'approved', short(task));
		});
	}
	if (workflow) {
		await step('workflow update (withdraw)', async () => {
			const [updated] = await run({
				resource: 'workflow', operation: 'update', recordId: rl(workflow.id),
				updateFields: { status: 'completed', completionReason: 'withdrawn', note: 'Withdrawn by the n8n live tests' },
			});
			console.log(`     workflow status ${updated.status}`);
		});
	}

	await step('record getAll teams', async () => {
		const rows = await run({ resource: 'record', operation: 'getAll', collection: rl('teams', 'list'), returnAll: false, limit: 3, options: {} });
		assert(rows.length > 0, 'no teams');
	});

	// ------------------------------------------------ trigger
	const staticData = {};
	const params = { events: ['request.create', 'request.note-added'], options: {} };
	// must be a URL you own: Xurrent sends a webhook.verify message to it right away
	const webhookUrl = process.env.XURRENT_TEST_WEBHOOK_URL;
	const createdHooks = webhookUrl && await step('trigger create webhooks', async () => {
		assert((await hook('checkExists', params, staticData, webhookUrl)) === false, 'exists before create');
		await hook('create', params, staticData, webhookUrl);
		assert(staticData.webhooks?.length === 2 && staticData.secret, short(staticData));
		const remote = await asTrigger(() => api('GET', `webhooks/${staticData.webhooks[0].id}`));
		console.log(`     ${short({ ...remote, uri: undefined })}`);
		console.log(`     webhook ${remote.id}: ${remote.event} → ${remote.uri.replace(/secret=.*/, 'secret=…')}`);
		return true;
	});
	if (createdHooks) {
		await step('trigger checkExists after create', async () => {
			assert((await hook('checkExists', params, staticData, webhookUrl)) === true, 'not found');
			assert((await hook('checkExists', { ...params, events: ['request.create'] }, staticData, webhookUrl)) === false, 'events change not detected');
		});
		await step('trigger rejects calls without secret', async () => {
			const { result, response } = await webhook(params, staticData, { body: { event: 'request.create' } });
			assert(result.noWebhookResponse && response.statusCode === 401, short(response));
		});
		await step('trigger delivers event with record', async () => {
			const { result } = await webhook(params, staticData, {
				query: { secret: staticData.secret },
				body: { event: 'request.create', object_id: request?.id, person_id: me.id, payload: {} },
			});
			const output = result.workflowData[0][0].json;
			assert(output.record?.id === request?.id, short(output));
		});
		await step('trigger ignores events of listed people', async () => {
			const { result } = await webhook({ ...params, options: { ignorePersonIds: String(me.id) } }, staticData, {
				query: { secret: staticData.secret },
				body: { event: 'request.create', object_id: request?.id, person_id: me.id, payload: {} },
			});
			assert(!result.workflowData, 'not ignored');
		});
		await step('trigger delete webhooks', async () => {
			const ids = staticData.webhooks.map((w) => w.id);
			await hook('delete', params, staticData, webhookUrl);
			for (const id of ids) {
				try {
					await asTrigger(() => api('GET', `webhooks/${id}`));
					throw new Error(`webhook ${id} still exists`);
				} catch (error) {
					if (!/404/.test(error.message)) throw error;
				}
			}
		});
	}

	const passed = results.filter(Boolean).length;
	console.log(`\n${passed}/${results.length} passed`);
	process.exit(passed === results.length ? 0 : 1);
})();
