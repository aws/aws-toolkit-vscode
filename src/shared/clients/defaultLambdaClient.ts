/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Lambda } from 'aws-sdk'
import { _Blob } from 'aws-sdk/clients/lambda'
import { ext } from '../extensionGlobals'
import '../utilities/asyncIteratorShim'
import { LambdaClient } from './lambdaClient'
import { getLogger } from '../logger'

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

    public async getFunction(name: string): Promise<Lambda.GetFunctionResponse> {
        getLogger().debug(`GetFunction called for function: ${name}`)
        const client = await this.createSdkClient()

        try {
            const response = await client.getFunction({ FunctionName: name }).promise()
            getLogger().debug('GetFunction returned response: %O', response)
            return response
        } catch (e) {
            getLogger().error('Failed to get function: %O', e)
            throw e
        }
    }

    public async updateFunctionCode(name: string, zipFile: Buffer): Promise<Lambda.FunctionConfiguration> {
        getLogger().debug(`updateFunctionCode called for function: ${name}`)
        const client = await this.createSdkClient()

        try {
            const response = await client
                .updateFunctionCode({
                    FunctionName: name,
                    Publish: true,
                    ZipFile: zipFile,
                })
                .promise()
            getLogger().debug('updateFunctionCode returned response: %O', response)
            return response
        } catch (e) {
            getLogger().error('Failed to run updateFunctionCode: %O', e)
            throw e
        }
    }

    private async createSdkClient(): Promise<Lambda> {
        return await ext.sdkClientBuilder.createAndConfigureServiceClient(
            options => new Lambda(options),
            undefined,
            this.regionCode
        )
    }
}
