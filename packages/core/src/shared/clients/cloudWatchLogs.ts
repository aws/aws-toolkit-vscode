/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as CloudWatchLogs from '@aws-sdk/client-cloudwatch-logs'
import { ClientWrapper } from './clientWrapper'

export class CloudWatchLogsClient extends ClientWrapper<CloudWatchLogs.CloudWatchLogsClient> {
    public constructor(regionCode: string) {
        super(regionCode, CloudWatchLogs.CloudWatchLogsClient)
    }

    public async *describeLogGroups(
        request: CloudWatchLogs.DescribeLogGroupsRequest = {}
    ): AsyncIterableIterator<CloudWatchLogs.LogGroup> {
        do {
            const response: CloudWatchLogs.DescribeLogGroupsResponse = await this.makeRequest(
                CloudWatchLogs.DescribeLogGroupsCommand,
                request
            )
            if (response.logGroups) {
                yield* response.logGroups
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async describeLogStreams(
        request: CloudWatchLogs.DescribeLogStreamsRequest
    ): Promise<CloudWatchLogs.DescribeLogStreamsResponse> {
        return await this.makeRequest(CloudWatchLogs.DescribeLogStreamsCommand, request)
    }

    public async getLogEvents(
        request: CloudWatchLogs.GetLogEventsRequest
    ): Promise<CloudWatchLogs.GetLogEventsResponse> {
        return await this.makeRequest(CloudWatchLogs.GetLogEventsCommand, request)
    }

    public async filterLogEvents(
        request: CloudWatchLogs.FilterLogEventsRequest
    ): Promise<CloudWatchLogs.FilterLogEventsResponse> {
        return await this.makeRequest(CloudWatchLogs.FilterLogEventsCommand, request)
    }
}
