/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as CloudControlV3 from '@aws-sdk/client-cloudcontrol'
import globals from '../extensionGlobals'
import { localize } from '../utilities/vsCodeUtils'
import { ClientWrapper } from './clientWrapper'

export class CloudControlClient extends ClientWrapper<CloudControlV3.CloudControlClient> {
    public constructor(regionCode: string) {
        super(regionCode, CloudControlV3.CloudControlClient)
    }

    public async createResource(
        request: CloudControlV3.CreateResourceInput
    ): Promise<CloudControlV3.CreateResourceOutput> {
        const createResponse: CloudControlV3.CreateResourceOutput = await this.makeRequest(
            CloudControlV3.CreateResourceCommand,
            request
        )

        await this.pollForCompletion(createResponse.ProgressEvent!)
        return createResponse
    }

    public async deleteResource(request: CloudControlV3.DeleteResourceInput): Promise<void> {
        const deleteResponse: CloudControlV3.DeleteResourceOutput = await this.makeRequest(
            CloudControlV3.DeleteResourceCommand,
            request
        )

        await this.pollForCompletion(deleteResponse.ProgressEvent!)
    }

    public async listResources(
        request: CloudControlV3.ListResourcesInput
    ): Promise<CloudControlV3.ListResourcesOutput> {
        return await this.makeRequest(CloudControlV3.ListResourcesCommand, request)
    }

    public async getResource(request: CloudControlV3.GetResourceInput): Promise<CloudControlV3.GetResourceOutput> {
        return await this.makeRequest(CloudControlV3.GetResourceCommand, request)
    }

    public async updateResource(request: CloudControlV3.UpdateResourceInput): Promise<void> {
        const updateResponse: CloudControlV3.UpdateResourceOutput = await this.makeRequest(
            CloudControlV3.UpdateResourceCommand,
            request
        )

        await this.pollForCompletion(updateResponse.ProgressEvent!)
    }

    private async getResourceRequestStatus(
        request: CloudControlV3.GetResourceRequestStatusInput
    ): Promise<CloudControlV3.GetResourceRequestStatusOutput> {
        return await this.makeRequest(CloudControlV3.GetResourceRequestStatusCommand, request)
    }

    private async pollForCompletion(
        progressEvent: CloudControlV3.ProgressEvent,
        baseDelay: number = 500,
        maxRetries: number = 10
    ): Promise<void> {
        for (let i = 0; i < maxRetries; i++) {
            const operationStatus = progressEvent.OperationStatus

            switch (operationStatus) {
                case 'SUCCESS':
                    return
                case 'FAILED':
                    throw new Error(
                        localize(
                            'AWS.message.error.cloudControl.pollResourceStatus.failed',
                            'Resource operation failed: {0} ({1})',
                            progressEvent.StatusMessage,
                            progressEvent.ErrorCode
                        )
                    )
                case 'CANCEL_COMPLETE':
                    throw new Error(
                        localize(
                            'AWS.message.error.cloudControl.pollResourceStatus.cancelled',
                            'Resource operation cancelled: {0}',
                            progressEvent.StatusMessage
                        )
                    )
                case 'IN_PROGRESS':
                case 'CANCEL_IN_PROGRESS':
                case 'PENDING':
                    break
                default:
                    throw new Error(
                        localize(
                            'AWS.message.error.cloudControl.pollResourceStatus.invalidOperationStatus',
                            'Invalid resource operation status: {0}',
                            operationStatus
                        )
                    )
            }

            if (i + 1 < maxRetries) {
                await new Promise<void>((resolve) => globals.clock.setTimeout(resolve, baseDelay * 2 ** i))
                const resourceRequestStatus = await this.getResourceRequestStatus({
                    RequestToken: progressEvent.RequestToken,
                })
                progressEvent = resourceRequestStatus.ProgressEvent!
            }
        }
        throw new Error(
            localize(
                'AWS.message.error.cloudControl.pollResourceStatus.timeout',
                'Failed to get terminal resource operation status for {0} before timeout. Please try again later',
                progressEvent.Identifier
            )
        )
    }
}
