/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EMRServerless } from 'aws-sdk'
import globals from '../extensionGlobals'
import { RequiredProps } from '../utilities/tsUtils'
import { waitUntil } from '../utilities/timeoutUtils'
import { getLogger } from '../../shared/logger'

export type EmrApplication = RequiredProps<EMRServerless.ApplicationSummary, 'id'>
export type StableApplicationState = 'STOPPED' | 'STARTED'

export class EmrServerlessClient {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<EMRServerless> {
        return await globals.sdkClientBuilder.createAwsService(EMRServerless, undefined, this.regionCode)
    }

    public async *listApplications(): AsyncIterable<EMRServerless.ApplicationSummary> {
        const sdkClient = await this.createSdkClient()
        const request: EMRServerless.ListApplicationsRequest = {}
        do {
            const response = await sdkClient.listApplications(request).promise()
            if (response.applications) {
                yield* response.applications
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async startApplication(applicationId: string): Promise<void> {
        const sdkClient = await this.createSdkClient()
        await sdkClient.startApplication({ applicationId }).promise()
    }

    public async stopApplication(applicationId: string): Promise<void> {
        const sdkClient = await this.createSdkClient()
        await sdkClient.stopApplication({ applicationId }).promise()
    }

    public async waitForApplicationState(applicationId: string, desiredState: StableApplicationState): Promise<void> {
        const sdkClient = await this.createSdkClient()

        await waitUntil(
            async () => {
                const resp = await sdkClient.getApplication({ applicationId }).promise()

                getLogger().debug(
                    `app state application: ${resp.application.state} === ${desiredState} (${
                        resp.application.state === desiredState
                    })`
                )
                return resp.application.state === desiredState
            },
            // Check every 5 seconds, and timeout after 5 minutes
            { interval: 5 * 1000, timeout: 5 * 60 * 1000, truthy: true }
        )
    }

    public async *listJobRuns(applicationId: string): AsyncIterable<EMRServerless.JobRunSummary> {
        const sdkClient = await this.createSdkClient()
        const request: EMRServerless.ListJobRunsRequest = { applicationId: applicationId }
        do {
            const response = await sdkClient.listJobRuns(request).promise()
            if (response.jobRuns) {
                yield* response.jobRuns
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async getDashboardForJobRun(applicationId: string, jobRunId: string): Promise<string> {
        const sdkClient = await this.createSdkClient()

        const response = await sdkClient.getDashboardForJobRun({ applicationId, jobRunId }).promise()
        return response.url!
    }
}
