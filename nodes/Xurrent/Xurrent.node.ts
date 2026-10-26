import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { executeAttachment, executeRecord } from './actions/other';
import { executeRecordResource, RUNTIMES } from './actions/resources';
import { configurationItemDescription, personDescription } from './descriptions/DirectoryDescriptions';
import { attachmentDescription, recordDescription } from './descriptions/OtherDescriptions';
import { problemDescription } from './descriptions/ProblemDescription';
import { requestDescription } from './descriptions/RequestDescription';
import { authenticationProperty, xurrentCredentials } from './descriptions/shared';
import { taskDescription } from './descriptions/TaskDescription';
import { workflowDescription } from './descriptions/WorkflowDescription';
import { listSearch, loadOptions } from './methods';

export class Xurrent implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Xurrent',
		name: 'xurrent',
		icon: { light: 'file:xurrent.svg', dark: 'file:xurrent.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Work with requests, problems, workflows, tasks, approvals, configuration items, people, notes, attachments and any other record in Xurrent (formerly 4me)',
		defaults: {
			name: 'Xurrent',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: xurrentCredentials,
		properties: [
			authenticationProperty,
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Attachment',
						value: 'attachment',
						description: 'Upload files to use in notes, or download attachments',
					},
					{ name: 'Configuration Item', value: 'configurationItem' },
					{ name: 'Person', value: 'person' },
					{ name: 'Problem', value: 'problem' },
					{
						name: 'Record (Any Collection)',
						value: 'record',
						description: 'Any other API collection, e.g. teams, organizations, services, or a custom API call',
					},
					{ name: 'Request', value: 'request', description: 'Incidents, RFCs, RFIs, orders and other requests' },
					{ name: 'Task', value: 'task', description: 'Workflow tasks, including approvals' },
					{ name: 'Workflow', value: 'workflow', description: 'Workflows (formerly changes)' },
				],
				default: 'request',
			},
			...requestDescription,
			...problemDescription,
			...workflowDescription,
			...taskDescription,
			...configurationItemDescription,
			...personDescription,
			...recordDescription,
			...attachmentDescription,
		],
	};

	methods = { listSearch, loadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				if (resource === 'attachment') {
					const item = await executeAttachment.call(this, operation, itemIndex);
					returnData.push({ ...item, pairedItem: { item: itemIndex } });
					continue;
				}

				let result: IDataObject | IDataObject[];
				if (resource in RUNTIMES) {
					result = await executeRecordResource.call(this, resource, operation, itemIndex);
				} else if (resource === 'record') {
					result = await executeRecord.call(this, operation, itemIndex);
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported resource "${resource}"`, { itemIndex });
				}

				returnData.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result), {
						itemData: { item: itemIndex },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: itemIndex } });
					continue;
				}
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error.errorResponse ?? (error as unknown as JsonObject), {
						message: error.message,
						description: error.description ?? undefined,
						httpCode: error.httpCode ?? undefined,
						itemIndex,
					});
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error.message, {
						description: error.description ?? undefined,
						itemIndex,
					});
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
