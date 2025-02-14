/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service, Token } from 'aws-sdk'
import { omit } from 'lodash'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'
import * as FeatureDevProxyClient from './featuredevproxyclient'
import { featureName, startTaskAssistLimitReachedMessage } from '../constants'
import { CodeReference } from '../../amazonq/webview/ui/connector'
import {
    ApiError,
    CodeIterationLimitError,
    ContentLengthError,
    MonthlyConversationLimitError,
    UnknownApiError,
} from '../errors'
import { ToolkitError, isAwsError } from '../../shared/errors'
import { getCodewhispererConfig } from '../../codewhisperer/client/codewhisperer'
import { createCodeWhispererChatStreamingClient } from '../../shared/clients/codewhispererChatClient'
import { getClientId, getOptOutPreference, getOperatingSystem } from '../../shared/telemetry/util'
import { extensionVersion } from '../../shared/vscode/env'
import apiConfig = require('./codewhispererruntime-2022-11-11.json')
import { UserWrittenCodeTracker } from '../../codewhisperer/tracker/userWrittenCodeTracker'
import {
    FeatureDevCodeAcceptanceEvent,
    FeatureDevCodeGenerationEvent,
    MetricData,
    TelemetryEvent,
} from './featuredevproxyclient'
import { ExportResultArchiveCommandInput } from '@amzn/codewhisperer-streaming'
import { FeatureClient } from '../../amazonq/client/client'

// Re-enable once BE is able to handle retries.
const writeAPIRetryOptions = {
    maxRetries: 0,
    retryDelayOptions: {
        // The default number of milliseconds to use in the exponential backoff
        base: 500,
    },
}

// Create a client for featureDev proxy client based off of aws sdk v2
export async function createFeatureDevProxyClient(options?: Partial<ServiceOptions>): Promise<FeatureDevProxyClient> {
    const bearerToken = await AuthUtil.instance.getBearerToken()
    const cwsprConfig = getCodewhispererConfig()
    return (await globals.sdkClientBuilder.createAwsService(
        Service,
        {
            apiConfig: apiConfig,
            region: cwsprConfig.region,
            endpoint: cwsprConfig.endpoint,
            token: new Token({ token: bearerToken }),
            httpOptions: {
                connectTimeout: 10000, // 10 seconds, 3 times P99 API latency
            },
            ...options,
        } as ServiceOptions,
        undefined
    )) as FeatureDevProxyClient
}

export class FeatureDevClient implements FeatureClient {
    public async getClient(options?: Partial<ServiceOptions>) {
        // Should not be stored for the whole session.
        // Client has to be reinitialized for each request so we always have a fresh bearerToken
        return await createFeatureDevProxyClient(options)
    }

    public async createConversation() {
        try {
            const client = await this.getClient(writeAPIRetryOptions)
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
                // BE service will throw ServiceQuota if conversation limit is reached. API Front-end will throw Throttling with this message if conversation limit is reached
                if (
                    e.code === 'ServiceQuotaExceededException' ||
                    (e.code === 'ThrottlingException' && e.message.includes('reached for this month.'))
                ) {
                    throw new MonthlyConversationLimitError(e.message)
                }
                throw new ApiError(e.message, 'CreateConversation', e.code, e.statusCode ?? 400)
            }

            throw new UnknownApiError(e instanceof Error ? e.message : 'Unknown error', 'CreateConversation')
        }
    }

    public async createUploadUrl(
        conversationId: string,
        contentChecksumSha256: string,
        contentLength: number,
        uploadId: string
    ) {
        try {
            const client = await this.getClient(writeAPIRetryOptions)
            const params = {
                uploadContext: {
                    taskAssistPlanningUploadContext: {
                        conversationId,
                    },
                },
                uploadId,
                contentChecksum: contentChecksumSha256,
                contentChecksumType: 'SHA_256',
                artifactType: 'SourceCode',
                uploadIntent: 'TASK_ASSIST_PLANNING',
                contentLength,
            }
            getLogger().debug(`Executing createUploadUrl with %O`, omit(params, 'contentChecksum'))
            const response = await client.createUploadUrl(params).promise()
            getLogger().debug(`${featureName}: Created upload url: %O`, {
                uploadId: uploadId,
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

    public async startCodeGeneration(
        conversationId: string,
        uploadId: string,
        message: string,
        intent: FeatureDevProxyClient.Intent,
        codeGenerationId: string,
        currentCodeGenerationId?: string,
        intentContext?: FeatureDevProxyClient.IntentContext
    ) {
        try {
            const client = await this.getClient(writeAPIRetryOptions)
            const params = {
                codeGenerationId,
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
                intent,
            } as FeatureDevProxyClient.Types.StartTaskAssistCodeGenerationRequest
            if (currentCodeGenerationId) {
                params.currentCodeGenerationId = currentCodeGenerationId
            }
            if (intentContext) {
                params.intentContext = intentContext
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
            if (isAwsError(e)) {
                // API Front-end will throw Throttling if conversation limit is reached. API Front-end monitors StartCodeGeneration for throttling
                if (e.code === 'ThrottlingException' && e.message.includes(startTaskAssistLimitReachedMessage)) {
                    throw new MonthlyConversationLimitError(e.message)
                }
                // BE service will throw ServiceQuota if code generation iteration limit is reached
                else if (
                    e.code === 'ServiceQuotaExceededException' ||
                    (e.code === 'ThrottlingException' &&
                        e.message.includes('limit for number of iterations on a code generation'))
                ) {
                    throw new CodeIterationLimitError()
                }
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
            } satisfies ExportResultArchiveCommandInput
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
            UserWrittenCodeTracker.instance.onQFeatureInvoked()

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
     * @param conversationId
     */
    public async sendFeatureDevTelemetryEvent(conversationId: string) {
        await this.sendFeatureDevEvent('featureDevEvent', {
            conversationId,
        })
    }

    public async sendFeatureDevCodeGenerationEvent(event: FeatureDevCodeGenerationEvent) {
        getLogger().debug(
            `featureDevCodeGenerationEvent: conversationId: ${event.conversationId} charactersOfCodeGenerated: ${event.charactersOfCodeGenerated} linesOfCodeGenerated: ${event.linesOfCodeGenerated}`
        )
        await this.sendFeatureDevEvent('featureDevCodeGenerationEvent', event)
    }

    public async sendFeatureDevCodeAcceptanceEvent(event: FeatureDevCodeAcceptanceEvent) {
        getLogger().debug(
            `featureDevCodeAcceptanceEvent: conversationId: ${event.conversationId} charactersOfCodeAccepted: ${event.charactersOfCodeAccepted} linesOfCodeAccepted: ${event.linesOfCodeAccepted}`
        )
        await this.sendFeatureDevEvent('featureDevCodeAcceptanceEvent', event)
    }

    public async sendMetricData(event: MetricData) {
        getLogger().debug(`featureDevCodeGenerationMetricData: dimensions: ${event.dimensions}`)
        await this.sendFeatureDevEvent('metricData', event)
    }

    public async sendFeatureDevEvent<T extends keyof TelemetryEvent>(
        eventName: T,
        event: NonNullable<TelemetryEvent[T]>
    ) {
        try {
            const client = await this.getClient()
            const params: FeatureDevProxyClient.SendTelemetryEventRequest = {
                telemetryEvent: {
                    [eventName]: event,
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
                `${featureName}: successfully sent ${eventName} telemetryEvent:${'conversationId' in event ? ' ConversationId: ' + event.conversationId : ''} RequestId: ${response.$response.requestId}`
            )
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to send ${eventName} telemetry: ${(e as Error).name}: ${
                    (e as Error).message
                } RequestId: ${(e as any).requestId}`
            )
        }
    }
}
