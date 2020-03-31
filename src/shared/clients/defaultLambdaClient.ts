/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk'
import { _Blob } from 'aws-sdk/clients/lambda'
import { ext } from '../extensionGlobals'
import '../utilities/asyncIteratorShim'
import { LambdaClient } from './lambdaClient'

export class DefaultLambdaClient implements LambdaClient {
    public constructor(public readonly regionCode: string) {}

    public async deleteFunction(name: string): Promise<void> {
        const sdkClient = await this.createSdkClient()

        const response = await sdkClient
            .deleteFunction({
                FunctionName: name,
            })
            .promise()

        if (!!response.$response.error) {
            throw response.$response.error
        }
    }

    public async invoke(name: string, payload?: _Blob): Promise<Lambda.InvocationResponse> {
        const sdkClient = await this.createSdkClient()

        const response = await sdkClient
            .invoke({
                FunctionName: name,
                LogType: 'Tail',
                Payload: payload,
            })
            .promise()

        return response
    }

    public async *listFunctions(): AsyncIterableIterator<Lambda.FunctionConfiguration> {
        const client = await this.createSdkClient()

        const request: Lambda.ListFunctionsRequest = {}
        do {
            const response: Lambda.ListFunctionsResponse = await client.listFunctions(request).promise()

            if (!!response.Functions) {
                yield* response.Functions
            }

            request.Marker = response.NextMarker
        } while (!!request.Marker)
    }

    private async createSdkClient(): Promise<Lambda> {
        return await ext.sdkClientBuilder.createAndConfigureServiceClient(
            options => new Lambda(options),
            undefined,
            this.regionCode
        )
    }
}
