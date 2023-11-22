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
import * as FeatureDevProxyClient from './featuredevproxyclient'
import apiConfig = require('./codewhispererruntime-2022-11-11.json')
import { featureName } from '../constants'
import { ContentLengthError } from '../errors'

type AvailableRegion = 'Alpha-PDX' | 'Gamma-IAD' | 'Gamma-PDX'
const getCodeWhispererRegionAndEndpoint = () => {
    const cwsprEndpointMap: Record<AvailableRegion, { cwsprEndpoint: string; region: string }> = {
        'Alpha-PDX': { cwsprEndpoint: 'https://rts.alpha-us-west-2.codewhisperer.ai.aws.dev/', region: 'us-west-2' },
        'Gamma-IAD': { cwsprEndpoint: 'https://rts.gamma-us-east-1.codewhisperer.ai.aws.dev/', region: 'us-east-1' },
        'Gamma-PDX': { cwsprEndpoint: 'https://rts.gamma-us-west-2.codewhisperer.ai.aws.dev/', region: 'us-west-2' },
    }
    const region: string | undefined = vscode.workspace.getConfiguration('aws.amazonqFeatureDev').get('region') ?? ''
    return region in cwsprEndpointMap
        ? cwsprEndpointMap[region as keyof typeof cwsprEndpointMap]
        : cwsprEndpointMap['Gamma-IAD']
}

// Create a client for featureDev proxy client based off of aws sdk v2
export async function createFeatureDevProxyClient(): Promise<FeatureDevProxyClient> {
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
    )) as FeatureDevProxyClient
}

// Create a client for featureDev streaming based off of aws sdk v3
async function createFeatureDevStreamingClient(): Promise<CodeWhispererStreaming> {
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
            const { conversationId } = await client.createTaskAssistConversation().promise()
            return conversationId
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to start conversation: ${(e as Error).message} RequestId: ${
                    (e as any).requestId
                }`
            )
            throw new ToolkitError((e as Error).message, { code: 'CreateConversationFailed' })
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
            return response
        } catch (e: any) {
            getLogger().error(`${featureName}: failed to generate presigned url: ${(e as Error).message}`)
            if (e.code === 'ValidationException' && e.message.includes('Invalid contentLength')) {
                throw new ContentLengthError()
            }
            throw new ToolkitError((e as Error).message, { code: 'CreateUploadUrlFailed' })
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
                if (responseItem.error !== undefined) {
                    throw responseItem.error
                }
                assistantResponse.push(responseItem.assistantResponseEvent!.content)
            }
            return assistantResponse.join(' ')
        } catch (e) {
            getLogger().error(
                `${featureName}: failed to execute planning: ${(e as Error).message} RequestId: ${(e as any).requestId}`
            )
            throw new ToolkitError((e as Error).message, { code: 'GeneratePlanFailed' })
        }
    }
}
