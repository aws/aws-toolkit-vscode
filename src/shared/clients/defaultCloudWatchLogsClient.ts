/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError, CloudWatchLogs, Request } from 'aws-sdk'
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

export abstract class IteratingAWSCall<T> {
    private status: 'new' | 'started' | 'done'
    private nextRequest: Request<T, AWSError> | void = undefined

    public constructor() {
        this.status = 'new'
    }

    public async getNext(): Promise<T | undefined> {
        let request: Request<T, AWSError>
        if (this.status === 'new') {
            this.status = 'started'
            request = this.generateRequest()
        } else if (this.status === 'started' && this.nextRequest) {
            request = this.nextRequest
        } else {
            return undefined
        }

        const response = await request.promise()
        if (response.$response.nextPage()) {
            this.nextRequest = response.$response.nextPage()
        } else {
            this.status = 'done'
            this.nextRequest = undefined
        }

        return response
    }

    public async getAllRemaining(): Promise<T[]> {
        const responses: T[] = []
        let response: T | undefined = await this.getNext()
        while (response) {
            responses.push(response)
            response = await this.getNext()
        }

        return responses
    }

    protected abstract generateRequest(): Request<T, AWSError>
}

export class DescribeLogStreamsCall extends IteratingAWSCall<CloudWatchLogs.DescribeLogStreamsResponse> {
    public constructor(private readonly client: CloudWatchLogs, private readonly logGroupName: string) {
        super()
    }

    protected generateRequest(): Request<CloudWatchLogs.DescribeLogStreamsResponse, AWSError> {
        const requestParams: CloudWatchLogs.DescribeLogStreamsRequest = {
            logGroupName: this.logGroupName,
            orderBy: 'LastEventTime',
            descending: true,
            limit: 1, // TODO: remove, for testing purposes
        }
        return this.client.describeLogStreams(requestParams)
    }
}
