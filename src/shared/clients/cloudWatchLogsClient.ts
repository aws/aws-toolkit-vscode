/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
    CloudWatchLogs,
    DescribeLogGroupsCommandInput,
    DescribeLogGroupsCommandOutput,
    DescribeLogStreamsCommandInput,
    DescribeLogStreamsCommandOutput,
    FilterLogEventsCommandInput,
    FilterLogEventsCommandOutput,
    GetLogEventsCommandInput,
    GetLogEventsCommandOutput,
    LogGroup,
} from "@aws-sdk/client-cloudwatch-logs";

import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type CloudWatchLogsClient = ClassToInterfaceType<DefaultCloudWatchLogsClient>
export class DefaultCloudWatchLogsClient {
    public constructor(public readonly regionCode: string) {}

    public async *describeLogGroups(
        request: DescribeLogGroupsCommandInput = {}
    ): AsyncIterableIterator<LogGroup> {
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
        request: DescribeLogStreamsCommandInput
    ): Promise<DescribeLogStreamsCommandOutput> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.describeLogStreams(request);
    }

    public async getLogEvents(
        request: GetLogEventsCommandInput
    ): Promise<GetLogEventsCommandOutput> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.getLogEvents(request);
    }

    public async filterLogEvents(
        request: FilterLogEventsCommandInput
    ): Promise<FilterLogEventsCommandOutput> {
        const sdkClient = await this.createSdkClient()

        return sdkClient.filterLogEvents(request);
    }

    protected async invokeDescribeLogGroups(
        request: DescribeLogGroupsCommandInput,
        sdkClient: CloudWatchLogs
    ): Promise<DescribeLogGroupsCommandOutput> {
        return sdkClient.describeLogGroups(request);
    }

    protected async createSdkClient(): Promise<CloudWatchLogs> {
        return await globals.sdkClientBuilder.createAwsService(CloudWatchLogs, undefined, this.regionCode)
    }
}
