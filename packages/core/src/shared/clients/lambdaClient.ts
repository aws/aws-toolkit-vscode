/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlobPayloadInputTypes } from '@smithy/types'
import { ToolkitError } from '../errors'
import globals from '../extensionGlobals'
import { getLogger } from '../logger/logger'
import { ClassToInterfaceType } from '../utilities/tsUtils'

import {
    LambdaClient as LambdaSdkClient,
    GetFunctionCommand,
    GetFunctionCommandOutput,
    FunctionConfiguration,
    InvocationResponse,
    ListFunctionsRequest,
    ListFunctionsResponse,
    GetFunctionResponse,
    GetLayerVersionResponse,
    ListLayerVersionsRequest,
    LayerVersionsListItem,
    ListLayerVersionsResponse,
    UpdateFunctionConfigurationRequest,
    FunctionUrlConfig,
    GetFunctionConfigurationCommand,
    PublishVersionCommand,
    UpdateFunctionConfigurationCommand,
    UpdateFunctionCodeCommand,
    ListFunctionUrlConfigsCommand,
    ListLayerVersionsCommand,
    GetLayerVersionCommand,
    ListFunctionsCommand,
    DeleteFunctionCommand,
    InvokeCommand,
    waitUntilFunctionUpdatedV2,
    waitUntilFunctionActiveV2,
} from '@aws-sdk/client-lambda'
import { CancellationError } from '../utilities/timeoutUtils'
import { fromSSO } from '@aws-sdk/credential-provider-sso'
import { getIAMConnection } from '../../auth/utils'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import type { UserAgent } from '@aws-sdk/types'

export type LambdaClient = ClassToInterfaceType<DefaultLambdaClient>

export class DefaultLambdaClient {
    private readonly defaultTimeoutInMs: number

    public constructor(
        public readonly regionCode: string,
        public readonly userAgent: UserAgent | undefined = undefined
    ) {
        this.defaultTimeoutInMs = 5 * 60 * 1000 // 5 minutes (SDK default is 2 minutes)
    }

    public async deleteFunction(name: string, qualifier?: string): Promise<void> {
        const sdkClient = await this.createSdkClient()

        await sdkClient.send(
            new DeleteFunctionCommand({
                FunctionName: name,
                Qualifier: qualifier,
            })
        )
    }

    public async invoke(
        name: string,
        payload?: BlobPayloadInputTypes,
        version?: string,
        logtype: 'Tail' | 'None' = 'Tail'
    ): Promise<InvocationResponse> {
        const sdkClient = await this.createSdkClient()

        const response = await sdkClient.send(
            new InvokeCommand({
                FunctionName: name,
                LogType: logtype,
                Payload: payload,
                Qualifier: version,
            })
        )

        return response
    }

    public async *listFunctions(): AsyncIterableIterator<FunctionConfiguration> {
        const client = await this.createSdkClient()

        const request: ListFunctionsRequest = {}
        do {
            const response: ListFunctionsResponse = await client.send(new ListFunctionsCommand(request))

            if (response.Functions) {
                yield* response.Functions
            }

            request.Marker = response.NextMarker
        } while (request.Marker)
    }

    public async getFunction(name: string): Promise<GetFunctionResponse> {
        getLogger().debug(`GetFunction called for function: ${name}`)
        const client = await this.createSdkClient()

        try {
            const response = await client.send(new GetFunctionCommand({ FunctionName: name }))
            // prune `Code` from logs so we don't reveal a signed link to customer resources.
            getLogger().debug('GetFunction returned response (code section pruned): %O', {
                ...response,
                Code: 'Pruned',
            })
            return response
        } catch (e) {
            getLogger().error('Failed to get function: %s', e)
            throw e
        }
    }

    public async getLayerVersion(name: string, version: number): Promise<GetLayerVersionResponse> {
        getLogger().debug(`getLayerVersion called for LayerName: ${name}, VersionNumber ${version}`)
        const client = await this.createSdkClient()

        try {
            const response = await client.send(new GetLayerVersionCommand({ LayerName: name, VersionNumber: version }))
            // prune `Code` from logs so we don't reveal a signed link to customer resources.
            getLogger().debug('getLayerVersion returned response (code section pruned): %O', {
                ...response,
                Code: 'Pruned',
            })
            return response
        } catch (e) {
            getLogger().error('Failed to get function: %s', e)
            throw e
        }
    }

    public async *listLayerVersions(name: string): AsyncIterableIterator<LayerVersionsListItem> {
        const client = await this.createSdkClient()

        const request: ListLayerVersionsRequest = { LayerName: name }
        do {
            const response: ListLayerVersionsResponse = await client.send(new ListLayerVersionsCommand(request))

            if (response.LayerVersions) {
                yield* response.LayerVersions
            }

            request.Marker = response.NextMarker
        } while (request.Marker)
    }

    public async getFunctionUrlConfigs(name: string): Promise<FunctionUrlConfig[]> {
        getLogger().debug(`GetFunctionUrlConfig called for function: ${name}`)
        const client = await this.createSdkClient()

        try {
            const response = await client.send(new ListFunctionUrlConfigsCommand({ FunctionName: name }))
            // prune `Code` from logs so we don't reveal a signed link to customer resources.
            getLogger().debug('GetFunctionUrlConfig returned response (code section pruned): %O', {
                ...response,
                Code: 'Pruned',
            })
            return response.FunctionUrlConfigs ?? []
        } catch (e) {
            throw ToolkitError.chain(e, 'Failed to get Lambda function URLs')
        }
    }

    public async updateFunctionCode(name: string, zipFile: Uint8Array): Promise<FunctionConfiguration> {
        getLogger().debug(`updateFunctionCode called for function: ${name}`)
        const client = await this.createSdkClient()

        try {
            const response = await client.send(
                new UpdateFunctionCodeCommand({
                    FunctionName: name,
                    ZipFile: zipFile,
                })
            )
            getLogger().debug('updateFunctionCode returned response: %O', response)
            await waitUntilFunctionUpdatedV2({ client, maxWaitTime: 300 }, { FunctionName: name })

            return response
        } catch (e) {
            getLogger().error('Failed to run updateFunctionCode: %s', e)
            throw e
        }
    }

    public async updateFunctionConfiguration(
        params: UpdateFunctionConfigurationRequest,
        options: {
            maxRetries?: number
            initialDelayMs?: number
            backoffMultiplier?: number
            waitForUpdate?: boolean
        } = {}
    ): Promise<FunctionConfiguration> {
        const client = await this.createSdkClient()
        const maxRetries = options.maxRetries ?? 5
        const initialDelayMs = options.initialDelayMs ?? 1000
        const backoffMultiplier = options.backoffMultiplier ?? 2
        // return until lambda update is completed
        const waitForUpdate = options.waitForUpdate ?? false

        let retryCount = 0
        let lastError: any

        // there could be race condition, if function is being updated, wait and retry
        while (retryCount <= maxRetries) {
            try {
                const response = await client.send(new UpdateFunctionConfigurationCommand(params))
                getLogger().debug('updateFunctionConfiguration returned response: %O', response)
                if (waitForUpdate) {
                    // don't return if wait for result
                    break
                }
                return response
            } catch (e) {
                lastError = e

                // Check if this is an "update in progress" error
                if (this.isUpdateInProgressError(e) && retryCount < maxRetries) {
                    const delayMs = initialDelayMs * Math.pow(backoffMultiplier, retryCount)
                    getLogger().info(
                        `Update in progress for Lambda function ${params.FunctionName}. ` +
                            `Retrying in ${delayMs}ms (attempt ${retryCount + 1}/${maxRetries})`
                    )

                    await new Promise((resolve) => setTimeout(resolve, delayMs))
                    retryCount++
                } else {
                    getLogger().error('Failed to run updateFunctionConfiguration: %s', e)
                    throw e
                }
            }
        }

        // check if lambda update is completed, use client.getFunctionConfiguration to poll until
        // LastUpdateStatus is Successful or Failed
        if (waitForUpdate) {
            let lastUpdateStatus = 'InProgress'
            while (lastUpdateStatus === 'InProgress') {
                await new Promise((resolve) => setTimeout(resolve, 1000))
                const response = await client.send(
                    new GetFunctionConfigurationCommand({ FunctionName: params.FunctionName })
                )
                lastUpdateStatus = response.LastUpdateStatus ?? 'Failed'
                if (lastUpdateStatus === 'Successful') {
                    return response
                } else if (lastUpdateStatus === 'Failed') {
                    getLogger().error('Failed to update function configuration: %O', response)
                    throw new Error(`Failed to update function configuration: ${response.LastUpdateStatusReason}`)
                }
            }
        }

        getLogger().error(`Failed to update function configuration after ${maxRetries} retries: %s`, lastError)
        throw lastError
    }

    public async publishVersion(
        name: string,
        options: { waitForUpdate?: boolean } = {}
    ): Promise<FunctionConfiguration> {
        const client = await this.createSdkClient()
        // return until lambda update is completed
        const waitForUpdate = options.waitForUpdate ?? false
        const response = await client.send(
            new PublishVersionCommand({
                FunctionName: name,
            })
        )

        if (waitForUpdate) {
            let state = 'Pending'
            while (state === 'Pending') {
                await new Promise((resolve) => setTimeout(resolve, 1000))
                const statusResponse = await client.send(
                    new GetFunctionConfigurationCommand({ FunctionName: name, Qualifier: response.Version })
                )
                state = statusResponse.State ?? 'Failed'
                if (state === 'Active' || state === 'InActive') {
                    // version creation finished
                    return statusResponse
                } else if (state === 'Failed') {
                    getLogger().error('Failed to create Version: %O', statusResponse)
                    throw new Error(`Failed to create Version: ${statusResponse.LastUpdateStatusReason}`)
                }
            }
        }

        return response
    }

    private isUpdateInProgressError(error: any): boolean {
        return (
            error?.message &&
            error.message.includes(
                'The operation cannot be performed at this time. An update is in progress for resource:'
            )
        )
    }

    public async waitForActive(
        functionName: string,
        waiter?: { maxWaitTime?: number; minDelay?: number; maxDelay?: number }
    ): Promise<void> {
        const sdkClient = await this.createSdkClient()

        await waitUntilFunctionActiveV2(
            {
                client: sdkClient,
                maxWaitTime: waiter?.maxWaitTime ?? 600,
                minDelay: waiter?.minDelay ?? 1,
                maxDelay: waiter?.maxDelay ?? 120,
            },
            { FunctionName: functionName }
        )
    }

    private async createSdkClient(): Promise<LambdaSdkClient> {
        return globals.sdkClientBuilderV3.createAwsService({
            serviceClient: LambdaSdkClient as any,
            userAgent: !this.userAgent,
            clientOptions: {
                customUserAgent: this.userAgent,
                region: this.regionCode,
                requestHandler: new NodeHttpHandler({
                    requestTimeout: this.defaultTimeoutInMs,
                }),
            },
        }) as LambdaSdkClient
    }
}

export async function getFunctionWithCredentials(region: string, name: string): Promise<GetFunctionCommandOutput> {
    const connection = await getIAMConnection({
        prompt: true,
        messageText: 'Opening a Lambda Function requires you to be authenticated.',
    })

    if (!connection) {
        throw new CancellationError('user')
    }

    const credentials =
        connection.type === 'iam' ? await connection.getCredentials() : fromSSO({ profile: connection.id })
    const client = new LambdaSdkClient({ region, credentials })

    const command = new GetFunctionCommand({ FunctionName: name })
    return client.send(command)
}
