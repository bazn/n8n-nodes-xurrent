import type {
	IAuthenticateGeneric,
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IDataObject,
	IHttpRequestHelper,
	INodeProperties,
} from 'n8n-workflow';

import { BASE_URL_EXPRESSION, xurrentConnectionProperties } from './XurrentApi.credentials';

/** OAuth token endpoint belonging to an API host: api.xurrent.com → oauth.xurrent.com/token. */
function tokenUrl(credentials: ICredentialDataDecryptedObject): string {
	if (credentials.tokenUrl) return String(credentials.tokenUrl).trim();
	const environment = String(credentials.environment ?? 'api.xurrent.com');
	const host =
		environment === 'custom'
			? new URL(
					/^https?:\/\//i.test(String(credentials.customUrl))
						? String(credentials.customUrl)
						: `https://${String(credentials.customUrl)}`,
				).host
			: environment;
	return `https://${host.replace(/^api\./, 'oauth.')}/token`;
}

export class XurrentOAuthApi implements ICredentialType {
	name = 'xurrentOAuthApi';

	displayName = 'Xurrent OAuth (Client Credentials) API';

	icon = {
		light: 'file:../nodes/Xurrent/xurrent.svg',
		dark: 'file:../nodes/Xurrent/xurrent.dark.svg',
	} as const;

	documentationUrl = 'https://developer.xurrent.com/v1/oauth/client_credentials_grant/';

	properties: INodeProperties[] = [
		...xurrentConnectionProperties,
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description: 'Client ID of the OAuth application (Settings → OAuth Applications, grant type Client Credentials)',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Token URL',
			name: 'tokenUrl',
			type: 'string',
			default: '',
			placeholder: 'https://oauth.xurrent.com/token',
			description:
				'Leave empty to derive it from the environment (api.… → oauth.…/token). Set it only if your OAuth endpoint differs.',
		},
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'hidden',
			typeOptions: { expirable: true, password: true },
			default: '',
		},
	];

	async preAuthentication(this: IHttpRequestHelper, credentials: ICredentialDataDecryptedObject) {
		const response = (await this.helpers.httpRequest({
			method: 'POST',
			url: tokenUrl(credentials),
			headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
			body: new URLSearchParams({
				grant_type: 'client_credentials',
				client_id: String(credentials.clientId),
				client_secret: String(credentials.clientSecret),
			}).toString(),
			json: true,
		})) as IDataObject;

		return { accessToken: response.access_token as string };
	}

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.accessToken}}',
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
