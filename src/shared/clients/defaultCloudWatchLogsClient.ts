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

    public async describeLogStreams(
        request: CloudWatchLogs.DescribeLogStreamsRequest
    ): Promise<CloudWatchLogs.DescribeLogStreamsResponse> {
        const sdkClient = await this.createSdkClient()

        return await sdkClient.describeLogStreams(request).promise()
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

export class IteratingAWSCall<TRequest, TResponse> {
    private isDone: boolean = false
    private nextToken: string | undefined = undefined

    public constructor(
        private readonly awsCall: (request: TRequest) => Promise<TResponse>,
        private readonly nextTokenNames: {
            request: keyof TRequest
            response: keyof TResponse
        }
    ) {}

    public async *getIteratorForRequest(request: TRequest): AsyncIterableIterator<TResponse> {
        if (this.isDone) {
            return undefined
        }

        const response: TResponse = await this.awsCall({
            ...request,
            [this.nextTokenNames.request]: this.nextToken,
        })

        if (response[this.nextTokenNames.response]) {
            this.nextToken = (response[this.nextTokenNames.response] as any) as string
        } else {
            this.nextToken = undefined
            this.isDone = true
        }

        yield response
    }
}
