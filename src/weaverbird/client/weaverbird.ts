/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeWhispererStreaming } from '@amzn/codewhisperer-streaming'
import { Service, Token } from 'aws-sdk'
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry'
import { omit } from 'lodash'
import * as vscode from 'vscode'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import { ToolkitError } from '../../shared/errors'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import * as WeaverbirdProxyClient from './weaverbirdproxyclient'
import apiConfig = require('./codewhispererruntime-2022-11-11.json')
import { featureName } from '../constants'

type AvailableRegion = 'Alpha-PDX' | 'Gamma-IAD' | 'Gamma-PDX'
const getCodeWhispererRegionAndEndpoint = () => {
    const cwsprEndpointMap: Record<AvailableRegion, { cwsprEndpoint: string; region: string }> = {
        'Alpha-PDX': { cwsprEndpoint: 'https://rts-641299012133.test.codewhisperer.ai.aws.dev', region: 'us-west-2' },
        'Gamma-IAD': { cwsprEndpoint: 'https://rts-732200995377.test.codewhisperer.ai.aws.dev/', region: 'us-east-1' },
        'Gamma-PDX': { cwsprEndpoint: 'https://rts-171763828851.test.codewhisperer.ai.aws.dev/', region: 'us-west-2' },
    }
    const region: string | undefined = vscode.workspace.getConfiguration('aws.weaverBird').get('region') ?? ''
    return region in cwsprEndpointMap
        ? cwsprEndpointMap[region as keyof typeof cwsprEndpointMap]
        : cwsprEndpointMap['Gamma-IAD']
}

// Create a client for weaverbird proxy client based off of aws sdk v2
export async function createWeaverbirdProxyClient(): Promise<WeaverbirdProxyClient> {
    const bearerToken = await AuthUtil.instance.getBearerToken()
    const { region, cwsprEndpoint } = getCodeWhispererRegionAndEndpoint()
    return (await globals.sdkClientBuilder.createAwsService(
        Service,
        {
            apiConfig: apiConfig,
            region: region,
            endpoint: cwsprEndpoint,
            token: new Token({ token: bearerToken }),
            // SETTING TO 0 FOR BETA. RE-ENABLE FOR RE-INVENT
            maxRetries: 0,
            retryDelayOptions: {
                // The default number of milliseconds to use in the exponential backoff
                base: 500,
            },
        } as ServiceOptions,
        undefined
    )) as WeaverbirdProxyClient
}

// Create a client for weaverbird streaming based off of aws sdk v3
async function createWeaverbirdStreamingClient(): Promise<CodeWhispererStreaming> {
    const bearerToken = await AuthUtil.instance.getBearerToken()
    const { region, cwsprEndpoint } = getCodeWhispererRegionAndEndpoint()
    const streamingClient = new CodeWhispererStreaming({
        endpoint: cwsprEndpoint,
        region: region,
        token: { token: bearerToken },
        // SETTING max attempts to 0 FOR BETA. RE-ENABLE FOR RE-INVENT
        // Implement exponential back off starting with a base of 500ms (500 + attempt^10)
        retryStrategy: new ConfiguredRetryStrategy(0, (attempt: number) => 500 + attempt ** 10),
    })
    return streamingClient
}

export class WeaverbirdClient {
    private async getClient() {
        // Should not be stored for the whole session.
        // Client has to be reinitialized for each request so we always have a fresh bearerToken
        return await createWeaverbirdProxyClient()
    }

    private async getStreamingClient() {
        // Should not be stored for the whole session.
        // Client has to be reinitialized for each request so we always have a fresh bearerToken
        return await createWeaverbirdStreamingClient()
    }

    public async createConversation() {
        try {
            const client = await this.getClient()
            getLogger().debug(`Executing createTaskAssistConversation with {}`)
            const { conversationId } = await client.createTaskAssistConversation().promise()
            return conversationId
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to start conversation: ${(e as Error).message} RequestId: ${
                    (e as any).requestId
                }`
            )
            throw e
        }
    }

    public async createUploadUrl(conversationId: string, contentChecksumSha256: string) {
        try {
            const client = await this.getClient()
            const params = {
                uploadContext: {
                    taskAssistPlanningUploadContext: {
                        conversationId,
                    },
                },
                contentChecksum: contentChecksumSha256,
                contentChecksumType: 'SHA_256',
                artifactType: 'SourceCode',
                uploadIntent: 'TASK_ASSIST_PLANNING',
            }
            getLogger().debug(`Executing createUploadUrl with %O`, omit(params, 'contentChecksum'))
            const response = await client.createUploadUrl(params).promise()
            return response
        } catch (e) {
            getLogger().error(`${featureName}: failed to generate presigned url: ${(e as Error).message}`)
            throw e
        }
    }
    public async generatePlan(conversationId: string, uploadId: string, userMessage: string) {
        try {
            const streamingClient = await this.getStreamingClient()
            const params = {
                workspaceState: {
                    programmingLanguage: { languageName: 'javascript' },
                    uploadId,
                },
                conversationState: {
                    currentMessage: { userInputMessage: { content: userMessage } },
                    chatTriggerType: 'MANUAL',
                    conversationId,
                },
            }
            getLogger().debug(`Executing generateTaskAssistPlan with %O`, params)
            const response = await streamingClient.generateTaskAssistPlan(params)
            if (!response.planningResponseStream) {
                return undefined
            }

            const assistantResponse = []
            for await (const responseItem of response.planningResponseStream) {
                assistantResponse.push(responseItem.assistantResponseEvent!.content)
            }
            return assistantResponse.join(' ')
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to execute planning: ${(e as Error).message} RequestId: ${(e as any).requestId}`
            )
            throw e
        }
    }

    public async startCodeGeneration(conversationId: string, uploadId: string, message?: string) {
        try {
            const client = await this.getClient()
            const params = {
                conversationState: {
                    conversationId,
                    currentMessage: { ...(message ? { userInputMessage: { content: message } } : {}) },
                    chatTriggerType: 'MANUAL',
                },
                workspaceState: {
                    uploadId,
                    programmingLanguage: { languageName: 'javascript' },
                },
            }
            getLogger().debug(`Executing startTaskAssistCodeGeneration with %O`, params)
            const response = await client.startTaskAssistCodeGeneration(params).promise()

            return response
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to start code generation: ${(e as Error).message} RequestId: ${
                    (e as any).requestId
                }`
            )
            throw e
        }
    }

    public async getCodeGeneration(conversationId: string, codeGenerationId: string) {
        try {
            const client = await this.getClient()
            const params = {
                codeGenerationId,
                conversationId,
            }
            getLogger().debug(`Executing getTaskAssistCodeGeneration with %O`, params)
            const response = await client.getTaskAssistCodeGeneration(params).promise()

            return response
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to start get code generation results: ${(e as Error).message} RequestId: ${
                    (e as any).requestId
                }`
            )
            throw e
        }
    }

    public async exportResultArchive(conversationId: string) {
        try {
            const streamingClient = await this.getStreamingClient()
            const params = {
                exportId: conversationId,
                exportIntent: 'TASK_ASSIST',
            }
            getLogger().debug(`Executing exportResultArchive with %O`, params)
            const archiveResponse = await streamingClient.exportResultArchive(params)
            const buffer: number[] = []
            if (archiveResponse.body === undefined) {
                throw new ToolkitError('Empty response from CodeWhisperer Streaming service.')
            }
            for await (const chunk of archiveResponse.body) {
                buffer.push(...(chunk.binaryPayloadEvent?.bytes ?? []))
            }

            const {
                code_generation_result: { new_file_contents: newFiles },
            } = JSON.parse(new TextDecoder().decode(Buffer.from(buffer))) as {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                code_generation_result: { new_file_contents: Record<string, string> }
            }

            const newFileContents: { filePath: string; fileContent: string }[] = []
            for (const [filePath, fileContent] of Object.entries(newFiles)) {
                newFileContents.push({ filePath, fileContent })
            }

            return newFileContents
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to export archive result: ${(e as Error).message} RequestId: ${
                    (e as any).requestId
                }`
            )
            throw e
        }
    }
}
