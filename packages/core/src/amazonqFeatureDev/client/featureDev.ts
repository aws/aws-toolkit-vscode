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
import { featureName } from '../constants'
import { CodeReference } from '../../amazonq/webview/ui/connector'
import {
    ApiError,
    CodeIterationLimitError,
    ContentLengthError,
    MonthlyConversationLimitError,
    PlanIterationLimitError,
    UnknownApiError,
} from '../errors'
import {
    ToolkitError,
    isAwsError,
    isCodeWhispererStreamingServiceException,
    getHttpStatusCode,
} from '../../shared/errors'
import { getCodewhispererConfig } from '../../codewhisperer/client/codewhisperer'
import { LLMResponseType } from '../types'
import { createCodeWhispererChatStreamingClient } from '../../shared/clients/codewhispererChatClient'
import { getClientId, getOptOutPreference, getOperatingSystem } from '../../shared/telemetry/util'
import { extensionVersion } from '../../shared/vscode/env'
import apiConfig = require('./codewhispererruntime-2022-11-11.json')

/**
 * Creates and configures a FeatureDevProxyClient client based off of AWS SDK v2.
 *
 * This function sets up the client with the necessary authentication, configuration, API settings, and retry options.
 * Also AWS SDK options required for interacting with the Feature Development service.
 *
 * @returns {Promise<FeatureDevProxyClient>} A promise that resolves to a configured FeatureDevProxyClient.
 * @throws {Error} If there's an issue creating the client, such as authentication failures or SDK errors.
 */
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
    /**
     * Retrieves a FeatureDevProxyClient.
     * This method ensures that a new client is created for each request to maintain a fresh bearer token.
     *
     * @returns {Promise<FeatureDevProxyClient>} A promise that resolves to a new FeatureDevProxyClient
     * @throws {Error} If there's an issue retrieving the client.
     */
    public async getClient(): Promise<FeatureDevProxyClient> {
        // Should not be stored for the whole session.
        // Client has to be reinitialized for each request so we always have a fresh bearerToken
        return await createFeatureDevProxyClient()
    }

    /**
     * Creates a new conversation for the Amazon Q Feature Development service.
     *
     * @returns {Promise<string>} A promise that resolves to the created conversation ID.
     * @throws {MonthlyConversationLimitError} If the monthly conversation limit has been exceeded.
     * @throws {ApiError} If there's an API-related error during the conversation creation.
     * @throws {UnknownApiError} If an unknown error occurs during the process.
     */
    public async createConversation(): Promise<string> {
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
                if (e.code === 'ServiceQuotaExceededException') {
                    throw new MonthlyConversationLimitError(e.message)
                }
                throw new ApiError(e.message, 'CreateConversation', e.code, e.statusCode ?? 400)
            }

            throw new UnknownApiError(e instanceof Error ? e.message : 'Unknown error', 'CreateConversation')
        }
    }

    /**
     * Creates an upload URL for source code artifacts.
     *
     * @param {string} conversationId - The ID of the conversation associated with this upload.
     * @param {string} contentChecksumSha256 - The SHA-256 checksum of the content to be uploaded.
     * @param {number} contentLength - The length of the content to be uploaded.
     * @returns {Promise<{ uploadId: string, uploadUrl: string }>} A promise that resolves to an object containing the upload ID and URL.
     * @throws {Error} If there's an error in creating the upload URL.
     */
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
    /**
     * Generates a plan based on the user's message and workspace state.
     *
     * @param {string} conversationId - The ID of the conversation.
     * @param {string} uploadId - The ID of the uploaded workspace state.
     * @param {string} userMessage - The user's input message.
     * @returns {Promise<{ responseType: 'EMPTY'; approach?: string } | { responseType: 'VALID' | 'INVALID_STATE'; approach: string }>}
     *          A promise that resolves to an object containing the response type and approach.
     * @throws {Error} If there's an error in generating the plan.
     */
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
                    getHttpStatusCode(e) ?? streamResponseErrors[e.name] ?? 500
                )
            }

            throw new UnknownApiError(e instanceof Error ? e.message : 'Unknown error', 'GeneratePlan')
        }
    }

    /**
     * Starts the code generation process based on the conversation and workspace state.
     *
     * @param {string} conversationId - The ID of the conversation.
     * @param {string} uploadId - The ID of the uploaded workspace state.
     * @param {string} message - The user's input message for code generation.
     * @returns {Promise<any>} A promise that resolves to the response from the code generation service.
     * @throws {CodeIterationLimitError} If the code generation limit is exceeded.
     * @throws {Error} If there's an error in starting the code generation process.
     */
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

    /**
     * Retrieves the code generation results for a given conversation and code generation ID.
     *
     * @param {string} conversationId - The ID of the conversation.
     * @param {string} codeGenerationId - The ID of the code generation task.
     * @returns {Promise<any>} A promise that resolves to the code generation results.
     * @throws {ToolkitError} If there's an error in retrieving the code generation results.
     */
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

    /**
     * Exports the result archive for a given conversation.
     *
     * @param {string} conversationId - The ID of the conversation to export the result archive for.
     * @returns {Promise<{ newFiles: Record<string, string>, deletedFiles: string[], references: any[] }>} A promise that resolves to an object containing new files, deleted files, and references.
     * @throws {ToolkitError} If there's an error in exporting the result archive or if the response is empty.
     */
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

    /**
     * This event is specific to ABTesting purposes.
     *
     * No need to fail currently if the event fails in the request. In addition, currently there is no need for a return value.
     *
     * Sends a feature development telemetry event.
     *
     * @param {string} conversationId - The ID of the conversation associated with the telemetry event.
     * @returns {Promise<void>}
     */
    public async sendFeatureDevTelemetryEvent(conversationId: string) {
        try {
            const client = await this.getClient()
            const params: FeatureDevProxyClient.SendTelemetryEventRequest = {
                telemetryEvent: {
                    featureDevEvent: {
                        conversationId,
                    },
                },
                optOutPreference: getOptOutPreference(),
                userContext: {
                    ideCategory: 'VSCODE',
                    operatingSystem: getOperatingSystem(),
                    product: 'FeatureDev', // Should be the same as in JetBrains
                    clientId: getClientId(globals.globalState),
                    ideVersion: extensionVersion,
                },
            }
            const response = await client.sendTelemetryEvent(params).promise()
            getLogger().debug(
                `${featureName}: successfully sent featureDevEvent: ConversationId: ${conversationId} RequestId: ${response.$response.requestId}`
            )
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to send feature dev telemetry: ${(e as Error).name}: ${
                    (e as Error).message
                } RequestId: ${(e as any).requestId}`
            )
        }
    }
}
