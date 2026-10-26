// Unit tests for pure helpers. Run with `npm test` (builds first, then uses node:test against dist/).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');

const dist = path.join(__dirname, '..', '..', 'dist', 'nodes');
const g = require(path.join(dist, 'Xurrent', 'GenericFunctions.js'));
const constants = require(path.join(dist, 'Xurrent', 'constants.js'));
const { RUNTIMES, CREATE_FIELDS } = require(path.join(dist, 'Xurrent', 'actions', 'resources.js'));
const { buildNoteBody } = require(path.join(dist, 'Xurrent', 'actions', 'standard.js'));
const { extractUploadKey } = require(path.join(dist, 'Xurrent', 'actions', 'other.js'));
const { Xurrent } = require(path.join(dist, 'Xurrent', 'Xurrent.node.js'));
const { XurrentTrigger, decodeJwt, isJwt } = require(path.join(dist, 'XurrentTrigger', 'XurrentTrigger.node.js'));

const fakeExecute = { getNode: () => ({ name: 'Xurrent' }) };

test('getBaseUrl uses the environment host or a custom URL', () => {
	assert.equal(g.getBaseUrl({ environment: 'api.xurrent.com' }), 'https://api.xurrent.com/v1');
	assert.equal(g.getBaseUrl({ environment: 'api.ch.xurrent.qa' }), 'https://api.ch.xurrent.qa/v1');
	assert.equal(g.getBaseUrl({ environment: 'custom', customUrl: 'api.example.com/v1/ ' }), 'https://api.example.com/v1');
	assert.equal(g.getBaseUrl({ environment: 'custom', customUrl: 'http://localhost:3000/v1' }), 'http://localhost:3000/v1');
});

test('parseLinkHeader reads cursor links', () => {
	const links = g.parseLinkHeader(
		'<https://api.xurrent.com/v1/requests?per_page=25>; rel="first", <https://api.xurrent.com/v1/requests?per_page=25&search_after=abc>; rel="next"',
	);
	assert.equal(links.first, 'https://api.xurrent.com/v1/requests?per_page=25');
	assert.equal(links.next, 'https://api.xurrent.com/v1/requests?per_page=25&search_after=abc');
	assert.deepEqual(g.parseLinkHeader(undefined), {});
});

test('extractXurrentError joins validation errors', () => {
	const error = { response: { body: { message: 'Validation failed', errors: [['subject', "can't be blank"], ['team', 'is invalid']] } } };
	assert.deepEqual(g.extractXurrentError(error), {
		message: 'Validation failed',
		description: "subject: can't be blank; team: is invalid",
	});
	assert.deepEqual(g.extractXurrentError(new Error('x')), {});
});

test('toXurrentTimestamp converts offsets to UTC and keeps wall-clock values', () => {
	assert.equal(g.toXurrentTimestamp('2026-11-03T14:30:00.000+01:00'), '2026-11-03T13:30:00Z');
	assert.equal(g.toXurrentTimestamp('2026-11-03T13:30:00Z'), '2026-11-03T13:30:00Z');
	assert.equal(g.toXurrentTimestamp('2026-11-03T14:30:00'), '2026-11-03T14:30:00');
	assert.equal(g.toXurrentTimestamp(''), undefined);
});

test('resolveRecordId reads locators, plain values and record URLs', () => {
	assert.equal(g.resolveRecordId({ __rl: true, mode: 'list', value: '42' }), '42');
	assert.equal(g.resolveRecordId({ __rl: true, mode: 'list', value: '' }), undefined);
	assert.equal(g.resolveRecordId(' 7 '), '7');
	assert.equal(g.resolveRecordId('https://wdc.xurrent.com/requests/12345'), '12345');
	assert.equal(g.resolveRecordId('https://wdc.xurrent.com/requests/12345?tab=notes'), '12345');
	assert.equal(g.resolveRecordId(undefined), undefined);
});

test('parseIdList returns integer ids', () => {
	assert.deepEqual(g.parseIdList(' 1, 2 ,,x,3 '), [1, 2, 3]);
	assert.deepEqual(g.parseIdList(['4', '']), [4]);
});

test('buildBody maps fields, references, id lists, timestamps and custom fields', () => {
	const map = {
		subject: { api: 'subject', kind: 'plain' },
		team: { api: 'team', kind: 'reference' },
		ci: { api: 'ci', kind: 'references' },
		desired: { api: 'desired_completion_at', kind: 'timestamp' },
	};
	const body = g.buildBody.call(
		fakeExecute,
		map,
		{
			subject: 'VPN down',
			team: { __rl: true, mode: 'list', value: '12' },
			ci: '5, 6',
			desired: '2026-11-03T14:30:00.000+01:00',
			unknown: 'ignored',
			customFields: '{"cost_center": "IT"}',
			extraFields: '{"urgent": true, "subject": "override"}',
		},
		0,
	);
	assert.deepEqual(body, {
		subject: 'override',
		team_id: 12,
		ci_ids: [5, 6],
		desired_completion_at: '2026-11-03T13:30:00Z',
		custom_fields: [{ id: 'cost_center', value: 'IT' }],
		urgent: true,
	});
	assert.throws(() => g.buildBody.call(fakeExecute, map, { extraFields: '[1]' }, 0));
});

test('buildFilterQuery builds lists, reference filters and date ranges', () => {
	const map = {
		statuses: { api: 'status', kind: 'list' },
		team: { api: 'team', kind: 'reference' },
		subject: { api: 'subject', kind: 'equals' },
		disabled: { api: 'disabled', kind: 'boolean' },
		createdAfter: { api: 'created_at', kind: 'after' },
		createdBefore: { api: 'created_at', kind: 'before' },
		updatedAfter: { api: 'updated_at', kind: 'after' },
	};
	assert.deepEqual(
		g.buildFilterQuery(map, {
			statuses: ['assigned', 'accepted'],
			team: { __rl: true, mode: 'id', value: '4' },
			subject: 'Printer',
			disabled: false,
			createdAfter: '2026-01-01T00:00:00Z',
			createdBefore: '2026-02-01T00:00:00Z',
			updatedAfter: '2026-03-01T00:00:00Z',
		}),
		{
			status: 'assigned,accepted',
			team_id: '4',
			subject: 'Printer',
			disabled: 'false',
			created_at: '>2026-01-01T00:00:00Z<2026-02-01T00:00:00Z',
			updated_at: '>2026-03-01T00:00:00Z',
		},
	);
	assert.deepEqual(g.buildFilterQuery(map, { statuses: [] }), {});
});

test('customQuery, listOptionsQuery and collectionPath', () => {
	assert.deepEqual(g.customQuery({ parameter: [{ name: 'team_id', value: '!' }, { name: '', value: 'x' }] }), {
		team_id: '!',
	});
	assert.deepEqual(g.listOptionsQuery({ fields: ' subject, status ,', sort: '-created_at' }), {
		fields: 'subject,status',
		sort: '-created_at',
	});
	assert.equal(g.collectionPath('requests', 'open'), 'requests/open');
	assert.equal(g.collectionPath('requests', 'all'), 'requests');
	assert.equal(g.collectionPath('requests'), 'requests');
});

test('buildNoteBody adds flags and attachment keys only when set', () => {
	assert.deepEqual(buildNoteBody('Hello', {}), { text: 'Hello' });
	assert.deepEqual(buildNoteBody('Hi', { internal: true, suppressNotifications: true, attachmentKeys: 'a/1.txt, b/2.png' }), {
		text: 'Hi',
		internal: true,
		suppress_note_added_notifications: true,
		attachments: [{ key: 'a/1.txt' }, { key: 'b/2.png' }],
	});
});

test('extractUploadKey reads S3 XML, local JSON and the policy key fallback', () => {
	assert.equal(
		extractUploadKey('<PostResponse><Bucket>b</Bucket><Key>attachments/5/x/helloworld.txt</Key></PostResponse>'),
		'attachments/5/x/helloworld.txt',
	);
	assert.equal(extractUploadKey({ key: 'attachments/5/local.txt' }), 'attachments/5/local.txt');
	assert.equal(extractUploadKey('{"key":"attachments/1/a.txt"}'), 'attachments/1/a.txt');
	assert.equal(extractUploadKey('', 'attachments/5/abc/${filename}', 'doc.pdf'), 'attachments/5/abc/doc.pdf');
	assert.equal(extractUploadKey(''), undefined);
});

test('xurrentCredentialType picks the credential from the authentication parameter', () => {
	const exec = (value) => ({ getInputData: () => [], getNodeParameter: (_n, _i, fallback) => value ?? fallback });
	const hook = (value) => ({ getNodeParameter: (_n, fallback) => value ?? fallback });
	assert.equal(g.xurrentCredentialType(exec(undefined)), 'xurrentApi');
	assert.equal(g.xurrentCredentialType(exec('oAuth')), 'xurrentOAuthApi');
	assert.equal(g.xurrentCredentialType(hook('oAuth')), 'xurrentOAuthApi');
	assert.equal(g.xurrentCredentialType({ getNodeParameter: () => { throw new Error('missing'); } }), 'xurrentApi');
});

test('enum and event labels', () => {
	assert.equal(constants.enumLabel('waiting_for_customer'), 'Waiting for Customer');
	assert.equal(constants.enumLabel('assigned_to_my_team'), 'Assigned to My Team');
	assert.equal(constants.eventLabel('request.status-changed'), 'Request: Status Changed');
	assert.equal(constants.eventLabel('ci.create'), 'Configuration Item: Created');
	assert.equal(constants.eventLabel('automation_rule'), 'Automation Rule (Triggered by an Automation Rule)');
	for (const event of constants.WEBHOOK_EVENTS) {
		const noun = event.split('.')[0];
		if (noun !== 'automation_rule') assert.ok(constants.EVENT_COLLECTIONS[noun], `collection for ${event}`);
	}
});

test('decodeJwt decodes and verifies webhook policy tokens', () => {
	const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
	const pem = publicKey.export({ type: 'spki', format: 'pem' });
	const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const message = { event: 'request.create', object_id: 1 };
	const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ data: message, exp: Math.floor(Date.now() / 1000) + 60 })}`;
	const token = `${unsigned}.${crypto.sign('sha256', Buffer.from(unsigned), privateKey).toString('base64url')}`;

	assert.ok(isJwt(token));
	assert.ok(!isJwt('{"event":"x"}'));
	assert.deepEqual(decodeJwt(token, pem).data, message);
	assert.deepEqual(decodeJwt(token).data, message);

	const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
	assert.throws(() => decodeJwt(token, other), /Invalid JWT signature/);

	const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
	const ecUnsigned = `${encode({ alg: 'ES256' })}.${encode({ data: message })}`;
	const ecSignature = crypto.sign('sha256', Buffer.from(ecUnsigned), { key: ec.privateKey, dsaEncoding: 'ieee-p1363' });
	assert.deepEqual(
		decodeJwt(`${ecUnsigned}.${ecSignature.toString('base64url')}`, ec.publicKey.export({ type: 'spki', format: 'pem' })).data,
		message,
	);
});

/** Collects option names of a collection property shown for a resource and operation. */
function collectionOptions(properties, name, resource, operation) {
	const property = properties.find(
		(candidate) =>
			candidate.name === name &&
			candidate.displayOptions?.show?.resource?.includes(resource) &&
			candidate.displayOptions?.show?.operation?.includes(operation),
	);
	return property ? property.options.map((option) => option.name) : [];
}

test('every field and filter of the node is mapped to the API', () => {
	const { properties } = new Xurrent().description;
	for (const [resource, runtime] of Object.entries(RUNTIMES)) {
		const fieldNames = [
			...collectionOptions(properties, 'additionalFields', resource, 'create'),
			...collectionOptions(properties, 'updateFields', resource, 'update'),
			...CREATE_FIELDS[resource],
		];
		for (const name of fieldNames) {
			// JSON fields are handled by buildBody itself; the task's workflow is part of the create path
			if (name === 'customFields' || name === 'extraFields' || (resource === 'task' && name === 'workflow')) continue;
			assert.ok(runtime.fieldMap[name], `${resource}: field "${name}" has no API mapping`);
		}
		for (const name of collectionOptions(properties, 'filters', resource, 'getAll')) {
			assert.ok(runtime.filterMap[name], `${resource}: filter "${name}" has no API mapping`);
		}
		for (const name of CREATE_FIELDS[resource]) {
			assert.ok(
				properties.some((property) => property.name === name && property.displayOptions?.show?.resource?.includes(resource)),
				`${resource}: create field "${name}" is not a node parameter`,
			);
		}
	}
});

test('node descriptions load and every operation has a unique value per resource', () => {
	const { properties } = new Xurrent().description;
	const operations = properties.filter((property) => property.name === 'operation');
	const resources = properties.find((property) => property.name === 'resource').options.map((option) => option.value);
	for (const resource of resources) {
		const forResource = operations.filter((property) => property.displayOptions.show.resource.includes(resource));
		assert.equal(forResource.length, 1, `one operation selector for ${resource}`);
		const values = forResource[0].options.map((option) => option.value);
		assert.equal(new Set(values).size, values.length, `unique operations for ${resource}`);
		assert.ok(values.includes(forResource[0].default), `default operation of ${resource} exists`);
	}
	const trigger = new XurrentTrigger().description;
	assert.equal(trigger.webhooks.length, 1);
	assert.ok(trigger.properties.find((property) => property.name === 'events').options.length > 70);
});
