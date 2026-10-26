import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

/** Hosts of the Xurrent REST API per environment and region (https://developer.xurrent.com/v1/#service-url). */
export const XURRENT_ENVIRONMENTS = [
	{ name: 'Production – Global', value: 'api.xurrent.com' },
	{ name: 'Production – Australia', value: 'api.au.xurrent.com' },
	{ name: 'Production – Switzerland', value: 'api.ch.xurrent.com' },
	{ name: 'Production – United Kingdom', value: 'api.uk.xurrent.com' },
	{ name: 'Production – United States', value: 'api.us.xurrent.com' },
	{ name: 'Quality Assurance – Global', value: 'api.xurrent.qa' },
	{ name: 'Quality Assurance – Australia', value: 'api.au.xurrent.qa' },
	{ name: 'Quality Assurance – Switzerland', value: 'api.ch.xurrent.qa' },
	{ name: 'Quality Assurance – United Kingdom', value: 'api.uk.xurrent.qa' },
	{ name: 'Quality Assurance – United States', value: 'api.us.xurrent.qa' },
	{ name: 'Demo', value: 'api.xurrent-demo.com' },
	{ name: 'Custom URL', value: 'custom' },
];

/** Fields shared by both Xurrent credentials: where the API lives and which account to work in. */
export const xurrentConnectionProperties: INodeProperties[] = [
	{
		displayName: 'Environment',
		name: 'environment',
		type: 'options',
		options: XURRENT_ENVIRONMENTS,
		default: 'api.xurrent.com',
		description: 'Xurrent environment and region your account is hosted in',
	},
	{
		displayName: 'API URL',
		name: 'customUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://api.xurrent.com/v1',
		description: 'Base URL of the Xurrent REST API, including /v1',
		displayOptions: { show: { environment: ['custom'] } },
	},
	{
		displayName: 'Account ID',
		name: 'account',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'wdc',
		description:
			'ID of the Xurrent account to work in, sent as X-Xurrent-Account header, e.g. "wdc" for https://wdc.xurrent.com. Use the support domain account that holds the requests, not a directory account.',
	},
	{
		displayName: 'Language',
		name: 'language',
		type: 'string',
		default: '',
		placeholder: 'en',
		description:
			'Optional language for translated values and validation messages (X-Xurrent-Language header, e.g. en, de, nl). Defaults to the language of the user.',
	},
];

/** Base URL expression for credential tests; mirrors getBaseUrl() in GenericFunctions. */
export const BASE_URL_EXPRESSION =
	'={{ $credentials.environment === "custom" ? (/^https?:\\/\\//i.test($credentials.customUrl.trim()) ? $credentials.customUrl.trim() : "https://" + $credentials.customUrl.trim()).replace(/\\/+$/, "") : "https://" + $credentials.environment + "/v1" }}';

export class XurrentApi implements ICredentialType {
	name = 'xurrentApi';

	displayName = 'Xurrent API';

	icon = {
		light: 'file:../nodes/Xurrent/xurrent.svg',
		dark: 'file:../nodes/Xurrent/xurrent.dark.svg',
	} as const;

	documentationUrl = 'https://developer.xurrent.com/v1/#authentication';

	properties: INodeProperties[] = [
		...xurrentConnectionProperties,
		{
			displayName: 'Personal Access Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Personal access token created in Xurrent under My Profile → Personal Access Tokens. Its scopes limit what the node may do.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.token}}',
				'X-Xurrent-Account': '={{$credentials.account}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: BASE_URL_EXPRESSION,
			url: '/me',
		},
	};
}
