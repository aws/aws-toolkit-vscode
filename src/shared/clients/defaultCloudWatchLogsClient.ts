/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { CloudWatchLogsClient } from './cloudWatchLogsClient'

export class DefaultCloudWatchLogsClient implements CloudWatchLogsClient {
    public constructor(public readonly regionCode: string) {}

    public async *describeLogGroups(): AsyncIterableIterator<CloudWatchLogs.LogGroup> {
        const sdkClient = await this.createSdkClient()
        const request: CloudWatchLogs.DescribeLogGroupsRequest = {}
        do {
            const response = await this.invokeDescribeLogGroups(request, sdkClient)
            if (response.logGroups) {
                yield* response.logGroups
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    protected async invokeDescribeLogGroups(
        request: CloudWatchLogs.DescribeLogGroupsRequest,
        sdkClient: CloudWatchLogs
    ): Promise<CloudWatchLogs.DescribeLogGroupsResponse> {
        return sdkClient.describeLogGroups(request).promise()
    }

    protected async createSdkClient(): Promise<CloudWatchLogs> {
        return await ext.sdkClientBuilder.createAndConfigureServiceClient(
            options => new CloudWatchLogs(options),
            undefined,
            this.regionCode
        )
    }
}
