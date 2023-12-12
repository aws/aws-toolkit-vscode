/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeWhispererStreaming } from '@amzn/codewhisperer-streaming'
import { Service, Token } from 'aws-sdk'
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry'
import { omit } from 'lodash'
import { AuthUtil } from '../../codewhisperer/util/authUtil'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import * as FeatureDevProxyClient from './featuredevproxyclient'
import apiConfig = require('./codewhispererruntime-2022-11-11.json')
import { featureName } from '../constants'
import { ApiError, ContentLengthError, UnknownApiError } from '../errors'
import { endpoint, region } from '../../codewhisperer/models/constants'
import { isAwsError, isCodeWhispererStreamingServiceException } from '../../shared/errors'

// Create a client for featureDev proxy client based off of aws sdk v2
export async function createFeatureDevProxyClient(): Promise<FeatureDevProxyClient> {
    const bearerToken = await AuthUtil.instance.getBearerToken()
    return (await globals.sdkClientBuilder.createAwsService(
        Service,
        {
            apiConfig: apiConfig,
            region,
            endpoint,
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

// Create a client for featureDev streaming based off of aws sdk v3
async function createFeatureDevStreamingClient(): Promise<CodeWhispererStreaming> {
    const bearerToken = await AuthUtil.instance.getBearerToken()
    const streamingClient = new CodeWhispererStreaming({
        region,
        endpoint,
        token: { token: bearerToken },
        // SETTING max attempts to 0 FOR BETA. RE-ENABLE FOR RE-INVENT
        // Implement exponential back off starting with a base of 500ms (500 + attempt^10)
        retryStrategy: new ConfiguredRetryStrategy(0, (attempt: number) => 500 + attempt ** 10),
    })
    return streamingClient
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
    private async getClient() {
        // Should not be stored for the whole session.
        // Client has to be reinitialized for each request so we always have a fresh bearerToken
        return await createFeatureDevProxyClient()
    }

    public async getStreamingClient() {
        // Should not be stored for the whole session.
        // Client has to be reinitialized for each request so we always have a fresh bearerToken
        return await createFeatureDevStreamingClient()
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
            getLogger().debug(`${featureName}: Generated plan: %O`, {
                requestId: response.$metadata.requestId,
            })
            if (!response.planningResponseStream) {
                return undefined
            }

            const assistantResponse = []
            for await (const responseItem of response.planningResponseStream) {
                if (responseItem.error !== undefined) {
                    throw responseItem.error
                }
                assistantResponse.push(responseItem.assistantResponseEvent!.content)
            }
            return assistantResponse.join(' ')
        } catch (e) {
            if (isCodeWhispererStreamingServiceException(e)) {
                getLogger().error(
                    `${featureName}: failed to execute planning: ${e.message} RequestId: ${
                        e.$metadata.requestId ?? 'unknown'
                    }`
                )
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
}
