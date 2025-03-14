/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as CloudWatchLogsV3 from '@aws-sdk/client-cloudwatch-logs'
import { ClientWrapper } from './clientWrapper'

// TODO: each consumer of CWL client implements their own pagination. This should be done here.
export class CloudWatchLogsClient extends ClientWrapper<CloudWatchLogsV3.CloudWatchLogsClient> {
    public constructor(regionCode: string) {
        super(regionCode, CloudWatchLogsV3.CloudWatchLogsClient)
    }

    public async *describeLogGroups(
        request: CloudWatchLogsV3.DescribeLogGroupsRequest = {}
    ): AsyncIterableIterator<CloudWatchLogsV3.LogGroup> {
        do {
            const response: CloudWatchLogsV3.DescribeLogGroupsResponse = await this.makeRequest(
                CloudWatchLogsV3.DescribeLogGroupsCommand,
                request
            )
            if (response.logGroups) {
                yield* response.logGroups
            }
            request.nextToken = response.nextToken
        } while (request.nextToken)
    }

    public async describeLogStreams(
        request: CloudWatchLogsV3.DescribeLogStreamsRequest
    ): Promise<CloudWatchLogsV3.DescribeLogStreamsResponse> {
        return await this.makeRequest(CloudWatchLogsV3.DescribeLogStreamsCommand, request)
    }

    public async getLogEvents(
        request: CloudWatchLogsV3.GetLogEventsRequest
    ): Promise<CloudWatchLogsV3.GetLogEventsResponse> {
        return await this.makeRequest(CloudWatchLogsV3.GetLogEventsCommand, request)
    }

    public async filterLogEvents(
        request: CloudWatchLogsV3.FilterLogEventsRequest
    ): Promise<CloudWatchLogsV3.FilterLogEventsResponse> {
        return await this.makeRequest(CloudWatchLogsV3.FilterLogEventsCommand, request)
    }
}
