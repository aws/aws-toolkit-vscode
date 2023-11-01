/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Service, Token } from 'aws-sdk'
import globals from '../../shared/extensionGlobals'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import { Auth } from '../../auth/auth'
import { isSsoConnection } from '../../auth/connection'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { getConfig } from '../config'
import apiConfig = require('./codewhispererruntime-2022-11-11.json')
import * as WeaverbirdProxyClient from './weaverbirdproxyclient'
import { CodeWhispererStreaming } from '@amzn/codewhisperer-streaming'

const cwsprEndpoint = 'https://rts-641299012133.test.codewhisperer.ai.aws.dev'
export async function createWeaverbirdProxyClient(): Promise<WeaverbirdProxyClient> {
    const conn = Auth.instance.activeConnection
    if (!isSsoConnection(conn)) {
        throw new ToolkitError('Connection is not an SSO connection', { code: 'BadConnectionType' })
    }
    const weaverbirdConfig = getConfig()
    const bearerToken = await conn.getToken()
    return (await globals.sdkClientBuilder.createAwsService(
        Service,
        {
            apiConfig: apiConfig,
            region: weaverbirdConfig.region,
            endpoint: cwsprEndpoint, //CodeWhispererConstants.endpoint,
            onRequestSetup: [
                req => {
                    req.on('build', ({ httpRequest }) => {
                        httpRequest.headers['Authorization'] = `Bearer ${bearerToken.accessToken}`
                    })
                    console.log(JSON.stringify(req.httpRequest))
                },
            ],
            token: new Token({ token: bearerToken.accessToken, expireTime: bearerToken.expiresAt }),
        } as ServiceOptions,
        undefined
    )) as WeaverbirdProxyClient
}

export class WeaverbirdClient {
    private client?: WeaverbirdProxyClient
    private streamingClient?: CodeWhispererStreaming

    private async getClient() {
        if (!this.client) {
            this.client = await createWeaverbirdProxyClient()
        }
        return this.client
    }

    private async getStreamingClient() {
        if (!this.streamingClient) {
            const weaverbirdConfig = getConfig()
            const conn = Auth.instance.activeConnection
            if (!isSsoConnection(conn)) {
                throw new ToolkitError('Connection is not an SSO Connection')
            }
            const bearerToken = await conn.getToken()
            const streamingClient = new CodeWhispererStreaming({
                endpoint: cwsprEndpoint,
                region: weaverbirdConfig.region,
                token: { token: bearerToken.accessToken, expiration: bearerToken.expiresAt },
            })
            this.streamingClient = streamingClient
        }
        return this.streamingClient
    }

    public async createConversation() {
        try {
            const client = await this.getClient()
            const { conversationId } = await client.createTaskAssistConversation().promise()
            return conversationId
        } catch (e) {
            getLogger().error(
                `weaverbird: failed to start conversation: ${(e as Error).message} RequestId: ${(e as any).requestId}`
            )
            throw e
        }
    }

    public async createUploadUrl(conversationId: string, contentChecksumSha256: string) {
        try {
            const client = await this.getClient()
            const response = await client
                .createUploadUrl({
                    uploadContext: {
                        taskAssistPlanningUploadContext: {
                            conversationId,
                        },
                    },
                    contentChecksum: contentChecksumSha256,
                    contentChecksumType: 'SHA_256',
                    artifactType: 'SourceCode',
                    uploadIntent: 'TASK_ASSIST_PLANNING',
                })
                .promise()
            return response
        } catch (e) {
            getLogger().error(`weaverbird: failed to generate presigned url: ${(e as Error).message}`)
            throw e
        }
    }
    public async generatePlan(conversationId: string, uploadId: string, userMessage: string) {
        try {
            const streamingClient = await this.getStreamingClient()
            const response = await streamingClient.generateTaskAssistPlan({
                workspaceState: {
                    programmingLanguage: { languageName: 'javascript' },
                    uploadId,
                },
                conversationState: {
                    currentMessage: { userInputMessage: { content: userMessage } },
                    chatTriggerType: 'MANUAL',
                    conversationId,
                },
            })
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
                `weaverbird: failed to execute planning: ${(e as Error).message} RequestId: ${(e as any).requestId}`
            )
            throw e
        }
    }

    public async startCodeGeneration(conversationId: string, uploadId: string, message?: string) {
        try {
            const client = await this.getClient()
            const response = await client
                .startTaskAssistCodeGeneration({
                    conversationState: {
                        conversationId,
                        currentMessage: { ...(message ? { userInputMessage: { content: message } } : {}) },
                        chatTriggerType: 'MANUAL',
                    },
                    workspaceState: {
                        uploadId,
                        programmingLanguage: { languageName: 'javascript' },
                    },
                })
                .promise()

            return response
        } catch (e) {
            getLogger().error(
                `weaverbird: failed to start code generation: ${(e as Error).message} RequestId: ${
                    (e as any).requestId
                }`
            )
            throw e
        }
    }

    public async getCodeGeneration(conversationId: string, codeGenerationId: string) {
        try {
            const client = await this.getClient()
            const response = await client
                .getTaskAssistCodeGeneration({
                    codeGenerationId,
                    conversationId,
                })
                .promise()

            return response
        } catch (e) {
            getLogger().error(
                `weaverbird: failed to start get code generation results: ${(e as Error).message} RequestId: ${
                    (e as any).requestId
                }`
            )
            throw e
        }
    }

    public async exportResultArchive(conversationId: string) {
        try {
            const streamingClient = await this.getStreamingClient()
            const archiveResponse = await streamingClient.exportResultArchive({
                exportId: conversationId,
                exportIntent: 'TASK_ASSIST',
            })
            const buffer: number[] = []
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
                `weaverbird: failed to export archive result: ${(e as Error).message} RequestId: ${
                    (e as any).requestId
                }`
            )
            throw e
        }
    }
}
