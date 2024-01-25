/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateAssistantResponseRequest, SupplementaryWebLink, Reference } from '@amzn/codewhisperer-streaming'

import {
    GenerateResourceRequestMessage,
    GenerateResourceResponseMessage,
    WebviewContext,
    Command,
    MessageType,
} from '../types'
import { ChatSession } from '../../codewhispererChat/clients/chat/v0/chat'
import { AuthUtil, getChatAuthState } from '../../codewhisperer/util/authUtil'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'

const TIMEOUT = 30_000

export async function generateResourceHandler(request: GenerateResourceRequestMessage, context: WebviewContext) {
    try {
        const { chatResponse, references, metadata, isSuccess } = await generateResource(request.prompt)

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

async function generateResource(prompt: string) {
    let startTime = globals.clock.Date.now()

    try {
        const chatSession = new ChatSession()
        const request: GenerateAssistantResponseRequest = {
            conversationState: {
                currentMessage: {
                    userInputMessage: {
                        content: prompt,
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

        if (AuthUtil.instance.isConnectionExpired()) {
            await AuthUtil.instance.showReauthenticatePrompt()
        }

        startTime = globals.clock.Date.now()
        // TODO-STARLING - Revisit to see if timeout still needed prior to launch
        const data = await timeout(chatSession.chat(request), TIMEOUT)
        const initialResponseTime = globals.clock.Date.now() - startTime
        getLogger().debug(`CW Chat initial response time: ${initialResponseTime} ms`)
        getLogger().debug(`CW Chat initial response: ${JSON.stringify(data, undefined, 2)}`)
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

        // TODO-STARLING: Reduce/remove below
        getLogger().debug(`===== CW Chat prompt start ====`)
        getLogger().debug(prompt)
        getLogger().debug(`===== CW Chat prompt end ======`)
        getLogger().debug(`===== CW Chat metadata start ======`)
        getLogger().debug(`CW Chat conversationId = ${conversationId}`)
        getLogger().debug(`CW Chat metadata = \n${JSON.stringify(metadata, undefined, 2)}`)
        getLogger().debug(`CW Chat supplementaryWebLinks = \n${JSON.stringify(supplementaryWebLinks, undefined, 2)}`)
        getLogger().debug(`CW Chat references = \n${JSON.stringify(references, undefined, 2)}`)
        getLogger().debug(`===== CW Chat metadata end ======`)
        getLogger().debug(`===== CW Chat raw response start ======`)
        getLogger().debug(`${response}`)
        getLogger().debug(`===== CW Chat raw response end ======`)
        getLogger().debug(`CW Chat initial response time = ${initialResponseTime} ms`)
        getLogger().debug(`CW Chat elapsed time = ${elapsedTime} ms`)

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
        await debugConnection()
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

// TODO-STARLING
// Temporary function to assist with debug as Starling is coded
// This will likely be removed prior to launch
async function debugConnection() {
    const isConnected = AuthUtil.instance.isConnected()
    const isValid = AuthUtil.instance.isConnectionValid()
    const isExpired = AuthUtil.instance.isConnectionExpired()
    const authState = await getChatAuthState(AuthUtil.instance)
    const isConnectedToCodeWhisperer =
        authState.codewhispererChat === 'connected' || authState.codewhispererChat === 'expired'

    getLogger().debug(`DEBUG: debugConnection - isConnected = ${isConnected}`)
    getLogger().debug(`DEBUG: debugConnection - isValid = ${isValid}`)
    getLogger().debug(`DEBUG: debugConnection - isExpired = ${isExpired}`)
    getLogger().debug(`DEBUG: debugConnection - isConnectedToCodeWhisperer = ${isConnectedToCodeWhisperer}`)
}
