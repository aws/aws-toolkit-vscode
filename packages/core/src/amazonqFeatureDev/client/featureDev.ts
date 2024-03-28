/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service, Token } from 'aws-sdk'
import { omit } from 'lodash'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import * as FeatureDevProxyClient from './featuredevproxyclient'
import apiConfig = require('./codewhispererruntime-2022-11-11.json')
import { featureName } from '../constants'
import { CodeReference } from '../../amazonq/webview/ui/connector'
import {
    ApiError,
    CodeIterationLimitError,
    ContentLengthError,
    PlanIterationLimitError,
    UnknownApiError,
} from '../errors'
import { ToolkitError, isAwsError, isCodeWhispererStreamingServiceException } from '../../shared/errors'
import { getCodewhispererConfig } from '../../codewhisperer/client/codewhisperer'
import { LLMResponseType } from '../types'
import { createCodeWhispererChatStreamingClient } from '../../shared/clients/codewhispererChatClient'

// Create a client for featureDev proxy client based off of aws sdk v2
export async function createFeatureDevProxyClient(): Promise<FeatureDevProxyClient> {
    const bearerToken = await AuthUtil.instance.getBearerToken()
    const cwsprConfig = getCodewhispererConfig()
    return (await globals.sdkClientBuilder.createAwsService(
        Service,
        {
            apiConfig: apiConfig,
            region: cwsprConfig.region,
            endpoint: cwsprConfig.endpoint,
            token: new Token({ token: bearerToken }),
            // SETTING TO 0 FOR BETA. RE-ENABLE FOR RE-INVENT
            maxRetries: 0,
            retryDelayOptions: {
                // The default number of milliseconds to use in the exponential backoff
                base: 500,
            },
        } as ServiceOptions,
        undefined
    )) as FeatureDevProxyClient
}

const streamResponseErrors: Record<string, number> = {
    ValidationException: 400,
    AccessDeniedException: 403,
    ResourceNotFoundException: 404,
    ConflictException: 409,
    ThrottlingException: 429,
    InternalServerException: 500,
}

export class FeatureDevClient {
    public async getClient() {
        // Should not be stored for the whole session.
        // Client has to be reinitialized for each request so we always have a fresh bearerToken
        return await createFeatureDevProxyClient()
    }

    public async createConversation() {
        try {
            const client = await this.getClient()
            getLogger().debug(`Executing createTaskAssistConversation with {}`)
            const { conversationId, $response } = await client.createTaskAssistConversation().promise()
            getLogger().debug(`${featureName}: Created conversation: %O`, {
                conversationId,
                requestId: $response.requestId,
            })
            return conversationId
        } catch (e) {
            if (isAwsError(e)) {
                getLogger().error(
                    `${featureName}: failed to start conversation: ${e.message} RequestId: ${e.requestId}`
                )
                throw new ApiError(e.message, 'CreateConversation', e.code, e.statusCode ?? 400)
            }

            throw new UnknownApiError(e instanceof Error ? e.message : 'Unknown error', 'CreateConversation')
        }
    }

    public async createUploadUrl(conversationId: string, contentChecksumSha256: string, contentLength: number) {
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
                contentLength,
            }
            getLogger().debug(`Executing createUploadUrl with %O`, omit(params, 'contentChecksum'))
            const response = await client.createUploadUrl(params).promise()
            getLogger().debug(`${featureName}: Created upload url: %O`, {
                uploadId: response.uploadId,
                requestId: response.$response.requestId,
            })
            return response
        } catch (e) {
            if (isAwsError(e)) {
                getLogger().error(
                    `${featureName}: failed to generate presigned url: ${e.message} RequestId: ${e.requestId}`
                )
                if (e.code === 'ValidationException' && e.message.includes('Invalid contentLength')) {
                    throw new ContentLengthError()
                }
                throw new ApiError(e.message, 'CreateUploadUrl', e.code, e.statusCode ?? 400)
            }

            throw new UnknownApiError(e instanceof Error ? e.message : 'Unknown error', 'CreateUploadUrl')
        }
    }
    public async generatePlan(
        conversationId: string,
        uploadId: string,
        userMessage: string
    ): Promise<
        { responseType: 'EMPTY'; approach?: string } | { responseType: 'VALID' | 'INVALID_STATE'; approach: string }
    > {
        try {
            const streamingClient = await createCodeWhispererChatStreamingClient()
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
            getLogger().debug(`${featureName}: Generated plan: %O`, {
                requestId: response.$metadata.requestId,
            })
            let responseType: LLMResponseType = 'EMPTY'
            if (!response.planningResponseStream) {
                return { responseType }
            }

            const assistantResponse: string[] = []
            for await (const responseItem of response.planningResponseStream) {
                if (responseItem.error !== undefined) {
                    throw responseItem.error
                } else if (responseItem.invalidStateEvent !== undefined) {
                    getLogger().debug('Received Invalid State Event: %O', responseItem.invalidStateEvent)
                    assistantResponse.splice(0)
                    assistantResponse.push(responseItem.invalidStateEvent.message ?? '')
                    responseType = 'INVALID_STATE'
                    break
                } else if (responseItem.assistantResponseEvent !== undefined) {
                    responseType = 'VALID'
                    assistantResponse.push(responseItem.assistantResponseEvent.content ?? '')
                }
            }
            return { responseType, approach: assistantResponse.join('') }
        } catch (e) {
            if (isCodeWhispererStreamingServiceException(e)) {
                getLogger().error(
                    `${featureName}: failed to execute planning: ${e.message} RequestId: ${
                        e.$metadata.requestId ?? 'unknown'
                    }`
                )
                if (
                    (e.name === 'ThrottlingException' &&
                        e.message.includes('limit for number of iterations on an implementation plan')) ||
                    e.name === 'ServiceQuotaExceededException'
                ) {
                    throw new PlanIterationLimitError()
                }
                throw new ApiError(
                    e.message,
                    'GeneratePlan',
                    e.name,
                    e.$metadata?.httpStatusCode ?? streamResponseErrors[e.name] ?? 500
                )
            }

            throw new UnknownApiError(e instanceof Error ? e.message : 'Unknown error', 'GeneratePlan')
        }
    }

    public async startCodeGeneration(conversationId: string, uploadId: string, message: string) {
        try {
            const client = await this.getClient()
            const params = {
                conversationState: {
                    conversationId,
                    currentMessage: {
                        userInputMessage: { content: message },
                    },
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
            if (
                isAwsError(e) &&
                ((e.code === 'ThrottlingException' &&
                    e.message.includes('limit for number of iterations on a code generation')) ||
                    e.code === 'ServiceQuotaExceededException')
            ) {
                throw new CodeIterationLimitError()
            }
            throw new ToolkitError((e as Error).message, { code: 'StartCodeGenerationFailed' })
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
            throw new ToolkitError((e as Error).message, { code: 'GetCodeGenerationFailed' })
        }
    }

    public async exportResultArchive(conversationId: string) {
        try {
            const streamingClient = await createCodeWhispererChatStreamingClient()
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
                if (chunk.internalServerException !== undefined) {
                    throw chunk.internalServerException
                }
                buffer.push(...(chunk.binaryPayloadEvent?.bytes ?? []))
            }

            const {
                code_generation_result: {
                    new_file_contents: newFiles = {},
                    deleted_files: deletedFiles = [],
                    references = [],
                },
            } = JSON.parse(new TextDecoder().decode(Buffer.from(buffer))) as {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                code_generation_result: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    new_file_contents?: Record<string, string>
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    deleted_files?: string[]
                    references?: CodeReference[]
                }
            }

            const newFileContents: { zipFilePath: string; fileContent: string }[] = []
            for (const [filePath, fileContent] of Object.entries(newFiles)) {
                newFileContents.push({ zipFilePath: filePath, fileContent })
            }

            return { newFileContents, deletedFiles, references }
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to export archive result: ${(e as Error).message} RequestId: ${
                    (e as any).requestId
                }`
            )
            throw new ToolkitError((e as Error).message, { code: 'ExportResultArchiveFailed' })
        }
    }
}
