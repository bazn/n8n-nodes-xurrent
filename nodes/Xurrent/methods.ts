import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';

import { COLLECTIONS } from './constants';
import {
	parseLinkHeader,
	xurrentApiRequestAllItems,
	xurrentRawRequest,
	type XurrentResponse,
} from './GenericFunctions';

const LIST_PAGE_SIZE = 100;
/** Pages read when the user types a search text into a collection without server-side text search. */
const MAX_FILTER_PAGES = 10;

/**
 * The Search API (GET /search) supports these record types with full-text search
 * (https://developer.xurrent.com/v1/search/).
 */
async function searchApi(
	this: ILoadOptionsFunctions,
	types: string,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	// the Search API rejects queries shorter than 2 characters
	if (!filter || filter.trim().length < 2) {
		const collection = SEARCH_TYPE_COLLECTIONS[types];
		const nameField = SEARCH_NAME_FIELDS[collection] ?? 'name';
		return collection
			? listCollection.call(this, { collection, nameField }, filter?.trim() || undefined, paginationToken)
			: { results: [] };
	}
	const response = await xurrentRawRequest.call(this, {
		method: 'GET',
		url: 'search',
		qs: { q: filter, types, per_page: LIST_PAGE_SIZE, ...(paginationToken ? { page: paginationToken } : {}) },
		json: true,
	});
	const rows = Array.isArray(response.body) ? (response.body as IDataObject[]) : [];
	const next = response.headers['x-pagination-next-page'];
	return {
		results: rows.map((row) => ({
			name: row.details ? `${String(row.title)} (${String(row.details)})` : String(row.title ?? row.id),
			value: String(row.id),
		})),
		paginationToken: next ? String(next) : undefined,
	};
}

const SEARCH_TYPE_COLLECTIONS: Record<string, string> = {
	ci: 'cis',
	'knowledge-article': 'knowledge_articles',
	request: 'requests',
	'request-template': 'request_templates',
	service: 'services',
	'service-instance': 'service_instances',
	task: 'tasks',
};

const SEARCH_NAME_FIELDS: Record<string, string> = {
	cis: 'label',
	knowledge_articles: 'subject',
	request_templates: 'subject',
	requests: 'subject',
	tasks: 'subject',
};

interface CollectionSpec {
	collection: string;
	/** Fields requested in addition to id and the name field. */
	fields?: string[];
	nameField?: string;
	sort?: string;
	qs?: IDataObject;
	label?: (row: IDataObject) => string;
}

function defaultLabel(spec: CollectionSpec, row: IDataObject): string {
	if (spec.label) return spec.label(row);
	const name = row[spec.nameField ?? 'name'] ?? row.subject ?? row.label ?? row.id;
	return String(name);
}

/**
 * Lists a collection. Without a search text it pages through the cursor links; with a search text it
 * reads up to MAX_FILTER_PAGES pages and matches the name case-insensitively, because the REST API
 * only supports exact text filters.
 */
async function listCollection(
	this: ILoadOptionsFunctions,
	spec: CollectionSpec,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const nameField = spec.nameField ?? 'name';
	const qs: IDataObject = {
		fields: [...new Set(['id', nameField, ...(spec.fields ?? [])])].join(','),
		per_page: LIST_PAGE_SIZE,
		...(spec.sort ? { sort: spec.sort } : {}),
		...(spec.qs ?? {}),
	};

	const toItem = (row: IDataObject): INodeListSearchItems => ({ name: defaultLabel(spec, row), value: String(row.id) });

	if (!filter) {
		const response = await xurrentRawRequest.call(this, {
			method: 'GET',
			url: paginationToken ?? spec.collection,
			qs: paginationToken ? undefined : qs,
			json: true,
		});
		const rows = Array.isArray(response.body) ? (response.body as IDataObject[]) : [];
		return { results: rows.map(toItem), paginationToken: parseLinkHeader(response.headers.link).next };
	}

	const needle = filter.toLowerCase();
	const matches: INodeListSearchItems[] = [];
	let url: string | undefined = spec.collection;
	let query: IDataObject | undefined = qs;
	for (let page = 0; url && page < MAX_FILTER_PAGES; page++) {
		const response: XurrentResponse = await xurrentRawRequest.call(this, { method: 'GET', url, qs: query, json: true });
		const rows: IDataObject[] = Array.isArray(response.body) ? (response.body as IDataObject[]) : [];
		matches.push(
			...rows
				.map(toItem)
				.filter((item) => item.name.toLowerCase().includes(needle) || String(item.value) === filter.trim()),
		);
		url = rows.length ? parseLinkHeader(response.headers.link).next : undefined;
		query = undefined;
	}
	return { results: matches };
}

const personLabel = (row: IDataObject) =>
	row.primary_email ? `${String(row.name)} (${String(row.primary_email)})` : String(row.name ?? row.id);

const numbered = (field: string) => (row: IDataObject) => `#${String(row.id)} ${String(row[field] ?? '')}`.trim();

export const listSearch = {
	async searchRequests(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		if (!filter) {
			return listCollection.call(
				this,
				{ collection: 'requests', nameField: 'subject', label: numbered('subject') },
				filter,
				paginationToken,
			);
		}
		return searchApi.call(this, 'request', filter, paginationToken);
	},

	async searchTasks(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		if (!filter) {
			return listCollection.call(
				this,
				{ collection: 'tasks', nameField: 'subject', label: numbered('subject') },
				filter,
				paginationToken,
			);
		}
		return searchApi.call(this, 'task', filter, paginationToken);
	},

	async searchProblems(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listCollection.call(
			this,
			{ collection: 'problems', nameField: 'subject', label: numbered('subject') },
			filter,
			paginationToken,
		);
	},

	async searchWorkflows(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listCollection.call(
			this,
			{ collection: 'workflows', nameField: 'subject', label: numbered('subject') },
			filter,
			paginationToken,
		);
	},

	async searchCis(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		if (!filter) {
			return listCollection.call(
				this,
				{ collection: 'cis', nameField: 'label', fields: ['name'], label: (row) => `${String(row.label)} – ${String(row.name ?? '')}` },
				filter,
				paginationToken,
			);
		}
		return searchApi.call(this, 'ci', filter, paginationToken);
	},

	async searchServices(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return searchApi.call(this, 'service', filter, paginationToken);
	},

	async searchServiceInstances(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return searchApi.call(this, 'service-instance', filter, paginationToken);
	},

	async searchRequestTemplates(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return searchApi.call(this, 'request-template', filter, paginationToken);
	},

	async searchKnowledgeArticles(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return searchApi.call(this, 'knowledge-article', filter, paginationToken);
	},

	async searchTeams(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listCollection.call(this, { collection: 'teams', sort: 'name' }, filter, paginationToken);
	},

	async searchPeople(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		const spec: CollectionSpec = {
			collection: 'people',
			fields: ['primary_email'],
			sort: 'name',
			label: personLabel,
		};
		// primary_email is the one people filter that is case-insensitive, so use it for exact lookups
		if (filter && /^[^\s@]+@[^\s@]+$/.test(filter.trim())) {
			const rows = await xurrentApiRequestAllItems.call(
				this,
				'people',
				{ fields: 'id,name,primary_email', primary_email: filter.trim() },
				LIST_PAGE_SIZE,
			);
			return { results: rows.map((row) => ({ name: personLabel(row), value: String(row.id) })) };
		}
		return listCollection.call(this, spec, filter, paginationToken);
	},

	async searchOrganizations(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listCollection.call(this, { collection: 'organizations', sort: 'name' }, filter, paginationToken);
	},

	async searchSites(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listCollection.call(this, { collection: 'sites', sort: 'name' }, filter, paginationToken);
	},

	async searchProducts(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listCollection.call(this, { collection: 'products', sort: 'name' }, filter, paginationToken);
	},

	async searchWorkflowTemplates(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listCollection.call(
			this,
			{ collection: 'workflow_templates', nameField: 'subject', sort: 'subject' },
			filter,
			paginationToken,
		);
	},

	async searchTaskTemplates(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listCollection.call(
			this,
			{ collection: 'task_templates', nameField: 'subject', sort: 'subject' },
			filter,
			paginationToken,
		);
	},

	async searchCollections(this: ILoadOptionsFunctions, filter?: string) {
		const needle = (filter ?? '').toLowerCase();
		return {
			results: COLLECTIONS.filter(
				(collection) => collection.name.toLowerCase().includes(needle) || collection.value.includes(needle),
			),
		};
	},
};

/** Options from a small reference collection, e.g. workflow types or closure codes. */
async function referenceOptions(this: ILoadOptionsFunctions, collection: string): Promise<INodePropertyOptions[]> {
	const rows = await xurrentApiRequestAllItems.call(this, collection, {});
	return rows
		.filter((row) => row.disabled !== true)
		.map((row) => ({
			name: String(row.name ?? row.reference),
			value: String(row.reference ?? row.id),
			description: row.description ? String(row.description) : undefined,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export const loadOptions = {
	async getWorkflowTypes(this: ILoadOptionsFunctions) {
		return referenceOptions.call(this, 'workflow_types');
	},

	async getClosureCodes(this: ILoadOptionsFunctions) {
		return referenceOptions.call(this, 'closure_codes');
	},

	async getRfcTypes(this: ILoadOptionsFunctions) {
		return referenceOptions.call(this, 'rfc_types');
	},
};
