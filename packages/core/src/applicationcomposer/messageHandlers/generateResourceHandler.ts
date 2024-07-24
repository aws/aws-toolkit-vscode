/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    GenerateAssistantResponseRequest,
    SupplementaryWebLink,
    Reference,
    UserIntent,
} from '@amzn/codewhisperer-streaming'

import {
    GenerateResourceRequestMessage,
    GenerateResourceResponseMessage,
    WebviewContext,
    Command,
    MessageType,
} from '../types'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'
import { AmazonqNotFoundError, getAmazonqApi } from '../../amazonq/extApi'

const TIMEOUT = 30_000

export async function generateResourceHandler(request: GenerateResourceRequestMessage, context: WebviewContext) {
    try {
        const { chatResponse, references, metadata, isSuccess } = await generateResource(request.cfnType)

        const responseMessage: GenerateResourceResponseMessage = {
            command: Command.GENERATE_RESOURCE,
            messageType: MessageType.RESPONSE,
            chatResponse,
            references,
            metadata,
            isSuccess,
            traceId: request.traceId,
        }
        await context.panel.webview.postMessage(responseMessage)
    } catch (error: any) {
        getLogger().error(`Error in generateResourceHandler: ${error.message}`, error)

        const responseMessage: GenerateResourceResponseMessage = {
            command: Command.GENERATE_RESOURCE,
            messageType: MessageType.RESPONSE,
            isSuccess: false,
            errorMessage: error.message,
            traceId: request.traceId,
            chatResponse: '',
            references: [],
            metadata: {},
        }

        await context.panel.webview.postMessage(responseMessage)
    }
}

async function generateResource(cfnType: string) {
    let startTime = globals.clock.Date.now()

    try {
        const amazonqApi = await getAmazonqApi()
        if (!amazonqApi) {
            throw new AmazonqNotFoundError()
        }
        const request: GenerateAssistantResponseRequest = {
            conversationState: {
                currentMessage: {
                    userInputMessage: {
                        content: cfnType,
                        userIntent: UserIntent.GENERATE_CLOUDFORMATION_TEMPLATE,
                    },
                },
                chatTriggerType: 'MANUAL',
            },
        }

        let response = ''
        let metadata
        let conversationId
        let supplementaryWebLinks: SupplementaryWebLink[] = []
        let references: Reference[] = []

        await amazonqApi.authApi.reauthIfNeeded()

        startTime = globals.clock.Date.now()
        // TODO-STARLING - Revisit to see if timeout still needed prior to launch
        const data = await timeout(amazonqApi.chatApi.chat(request), TIMEOUT)
        const initialResponseTime = globals.clock.Date.now() - startTime
        getLogger().debug(`CW Chat initial response: ${JSON.stringify(data, undefined, 2)}, ${initialResponseTime} ms`)
        if (data['$metadata']) {
            metadata = data['$metadata']
        }

        if (data.generateAssistantResponseResponse === undefined) {
            getLogger().debug(`Error: Unexpected model response: ${JSON.stringify(data, undefined, 2)}`)
            throw new Error('No model response')
        }

        for await (const value of data.generateAssistantResponseResponse) {
            if (value?.assistantResponseEvent?.content) {
                try {
                    response += value.assistantResponseEvent.content
                } catch (error: any) {
                    getLogger().debug(`Warning: Failed to parse content response: ${error.message}`)
                    throw new Error('Invalid model response')
                }
            }
            if (value?.messageMetadataEvent?.conversationId) {
                conversationId = value.messageMetadataEvent.conversationId
            }

            const newWebLinks = value?.supplementaryWebLinksEvent?.supplementaryWebLinks

            if (newWebLinks && newWebLinks.length > 0) {
                supplementaryWebLinks = supplementaryWebLinks.concat(newWebLinks)
            }

            if (value.codeReferenceEvent?.references && value.codeReferenceEvent.references.length > 0) {
                references = references.concat(value.codeReferenceEvent.references)

                // Code References are not expected for these single resource prompts
                // As we don't yet have the workflows needed to accept references, create the properly structured
                // CW Reference log event, we will reject responses that have code references
                let errorMessage = 'Code references found for this response, rejecting.'

                if (conversationId) {
                    errorMessage += ` cID(${conversationId})`
                }

                if (metadata?.requestId) {
                    errorMessage += ` rID(${metadata.requestId})`
                }

                throw new Error(errorMessage)
            }
        }

        const elapsedTime = globals.clock.Date.now() - startTime

        getLogger().debug(
            `CW Chat Debug message:
             cfnType = "${cfnType}",
             conversationId = ${conversationId},
             metadata = \n${JSON.stringify(metadata, undefined, 2)},
             supplementaryWebLinks = \n${JSON.stringify(supplementaryWebLinks, undefined, 2)},
             references = \n${JSON.stringify(references, undefined, 2)},
             response = "${response}",
             initialResponse = ${initialResponseTime} ms,
             elapsed time = ${elapsedTime} ms`
        )

        return {
            chatResponse: response,
            references: [],
            metadata: {
                ...metadata,
                conversationId,
                queryTime: elapsedTime,
            },
            isSuccess: true,
        }
    } catch (error: any) {
        getLogger().debug(`CW Chat error: ${error.name} - ${error.message}`)
        if (error.$metadata) {
            const { requestId, cfId, extendedRequestId } = error.$metadata
            getLogger().debug(JSON.stringify({ requestId, cfId, extendedRequestId }, undefined, 2))
        }

        throw error
    }
}

function timeout<T>(promise: Promise<T>, ms: number, timeoutError = new Error('Promise timed out')): Promise<T> {
    const _timeout = new Promise<never>((_, reject) => {
        globals.clock.setTimeout(() => {
            reject(timeoutError)
        }, ms)
    })
    return Promise.race<T>([promise, _timeout])
}
