/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs } from 'aws-sdk'
import * as CloudWatchLogsV3 from '@aws-sdk/client-cloudwatch-logs'
import globals from '../extensionGlobals'
import { ClientWrapper } from './clientWrapper'

export class CloudWatchLogsClient extends ClientWrapper<CloudWatchLogsV3.CloudWatchLogsClient> {
    public constructor(regionCode: string) {
        super(regionCode, CloudWatchLogsV3.CloudWatchLogsClient)
    }

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
