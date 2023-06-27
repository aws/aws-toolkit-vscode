/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs } from 'aws-sdk'
import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type CloudWatchLogsClient = ClassToInterfaceType<DefaultCloudWatchLogsClient>
export class DefaultCloudWatchLogsClient {
    public constructor(public readonly regionCode: string) {}

    public async *describeLogGroups(
        request: CloudWatchLogs.DescribeLogGroupsRequest = {}
    ): AsyncIterableIterator<CloudWatchLogs.LogGroup> {
        const sdkClient = await this.createSdkClient()
        do {
            const response = await this.invokeDescribeLogGroups(request, sdkClient)
            if (response.logGroups) {
                yield* response.logGroups
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async describeLogStreams(
        request: CloudWatchLogs.DescribeLogStreamsRequest
    ): Promise<CloudWatchLogs.DescribeLogStreamsResponse> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.describeLogStreams(request).promise()
    }

    public async getLogEvents(
        request: CloudWatchLogs.GetLogEventsRequest
    ): Promise<CloudWatchLogs.GetLogEventsResponse> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.getLogEvents(request).promise()
    }

    public async filterLogEvents(
        request: CloudWatchLogs.FilterLogEventsRequest
    ): Promise<CloudWatchLogs.FilterLogEventsResponse> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.filterLogEvents(request).promise()
    }

    protected async invokeDescribeLogGroups(
        request: CloudWatchLogs.DescribeLogGroupsRequest,
        sdkClient: CloudWatchLogs
    ): Promise<CloudWatchLogs.DescribeLogGroupsResponse> {
        return sdkClient.describeLogGroups(request).promise()
    }

    protected async createSdkClient(): Promise<CloudWatchLogs> {
        return await globals.sdkClientBuilder.createAwsService(CloudWatchLogs, undefined, this.regionCode)
    }
}
