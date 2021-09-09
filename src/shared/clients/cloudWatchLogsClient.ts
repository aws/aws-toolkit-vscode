/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { pageableToCollection, AsyncCollection } from '../utilities/collectionUtils'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type CloudWatchLogsClient = ClassToInterfaceType<DefaultCloudWatchLogsClient>
export class DefaultCloudWatchLogsClient {
    public constructor(public readonly regionCode: string) {}

    public describeLogGroups(
        request: CloudWatchLogs.DescribeLogGroupsRequest = {}
    ): AsyncCollection<CloudWatchLogs.LogGroup[]> {
        const sdkClient = this.createSdkClient()
        const requester = async (request: CloudWatchLogs.DescribeLogGroupsRequest) =>
            (await sdkClient).describeLogGroups(request).promise()

        return pageableToCollection(requester, request, 'nextToken', 'logGroups').map(g => g ?? [])
    }

    public describeAllLogGroups(
        request: CloudWatchLogs.DescribeLogGroupsRequest = {}
    ): Promise<CloudWatchLogs.LogGroup[]> {
        return this.describeLogGroups(request).flatten().promise()
    }

    public describeLogStreams(
        request: CloudWatchLogs.DescribeLogStreamsRequest
    ): AsyncCollection<CloudWatchLogs.LogStream[]> {
        const sdkClient = this.createSdkClient()
        const requester = async (request: CloudWatchLogs.DescribeLogStreamsRequest) =>
            (await sdkClient).describeLogStreams(request).promise()

        return pageableToCollection(requester, request, 'nextToken', 'logStreams').map(g => g ?? [])
    }

    public describeAllLogStreams(
        request: CloudWatchLogs.DescribeLogStreamsRequest
    ): Promise<CloudWatchLogs.LogStream[]> {
        return this.describeLogStreams(request).flatten().promise()
    }

    public async getLogEvents(
        request: CloudWatchLogs.GetLogEventsRequest
    ): Promise<CloudWatchLogs.GetLogEventsResponse> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.getLogEvents(request).promise()
    }

    protected async createSdkClient(): Promise<CloudWatchLogs> {
        return await ext.sdkClientBuilder.createAwsService(CloudWatchLogs, undefined, this.regionCode)
    }
}
