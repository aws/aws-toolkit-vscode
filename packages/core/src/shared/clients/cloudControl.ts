/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as CloudControl from '@aws-sdk/client-cloudcontrol'
import globals from '../extensionGlobals'
import { localize } from '../utilities/vsCodeUtils'
import { ClientWrapper } from './clientWrapper'

export class CloudControlClient extends ClientWrapper<CloudControl.CloudControlClient> {
    public constructor(regionCode: string) {
        super(regionCode, CloudControl.CloudControlClient)
    }

    public async createResource(request: CloudControl.CreateResourceInput): Promise<CloudControl.CreateResourceOutput> {
        const createResponse: CloudControl.CreateResourceOutput = await this.makeRequest(
            CloudControl.CreateResourceCommand,
            request
        )

        await this.pollForCompletion(createResponse.ProgressEvent!)
        return createResponse
    }

    public async deleteResource(request: CloudControl.DeleteResourceInput): Promise<void> {
        const deleteResponse: CloudControl.DeleteResourceOutput = await this.makeRequest(
            CloudControl.DeleteResourceCommand,
            request
        )

        await this.pollForCompletion(deleteResponse.ProgressEvent!)
    }

    public async listResources(request: CloudControl.ListResourcesInput): Promise<CloudControl.ListResourcesOutput> {
        return await this.makeRequest(CloudControl.ListResourcesCommand, request)
    }

    public async getResource(request: CloudControl.GetResourceInput): Promise<CloudControl.GetResourceOutput> {
        return await this.makeRequest(CloudControl.GetResourceCommand, request)
    }

    public async updateResource(request: CloudControl.UpdateResourceInput): Promise<void> {
        const updateResponse: CloudControl.UpdateResourceOutput = await this.makeRequest(
            CloudControl.UpdateResourceCommand,
            request
        )

        await this.pollForCompletion(updateResponse.ProgressEvent!)
    }

    private async getResourceRequestStatus(
        request: CloudControl.GetResourceRequestStatusInput
    ): Promise<CloudControl.GetResourceRequestStatusOutput> {
        return await this.makeRequest(CloudControl.GetResourceRequestStatusCommand, request)
    }

    private async pollForCompletion(
        progressEvent: CloudControl.ProgressEvent,
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
