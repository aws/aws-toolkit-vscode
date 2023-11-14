/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateAssistantResponseRequest, SupplementaryWebLink, Reference } from '@amzn/codewhisperer-streaming'

import { GenerateResourceMessage, GenerateResourceResponseMessage, WebviewContext, Response } from '../types'
import { ChatSession } from '../../codewhispererChat/clients/chat/v0/chat'
import { AuthUtil, isValidCodeWhispererConnection } from '../../codewhisperer/util/authUtil'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger/logger'

const TIMEOUT = 30_000

export async function generateResourceHandler(request: GenerateResourceMessage, context: WebviewContext) {
    const { chatResponse, references, metadata } = await generateResource(request.prompt)

    context.panel.webview.postMessage({
        response: Response.GENERATE_RESOURCE,
        chatResponse: chatResponse,
        references: references,
        metadata: metadata,
    })
}

async function generateResource(prompt: string): Promise<GenerateResourceResponseMessage> {
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
            throw new Error('No chat response')
        }

        for await (const value of data.generateAssistantResponseResponse) {
            if (value?.assistantResponseEvent?.content) {
                try {
                    response += value.assistantResponseEvent.content
                } catch (error: any) {
                    // TODO-STARLING: Add Error Handling
                    getLogger().debug(`Warning: Failed to parse content response: ${error.message}`)
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
            references: supplementaryWebLinks,
            metadata: {
                ...metadata,
                conversationId,
                queryTime: elapsedTime,
            },
        }
    } catch (error: any) {
        getLogger().debug(`CW Chat error: ${error.name} - ${error.message}`)
        debugConnection()
        if (error.$metadata) {
            const { requestId, cfId, extendedRequestId } = error.$metadata
            getLogger().debug(JSON.stringify({ requestId, cfId, extendedRequestId }, undefined, 2))
        }

        // TODO-STARLING: Send error to AppComposer
        // for now, retrhowing error
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
function debugConnection() {
    const isConnected = AuthUtil.instance.isConnected()
    const isValid = AuthUtil.instance.isConnectionValid()
    const isExpired = AuthUtil.instance.isConnectionExpired()
    const isValidConnection = isValidCodeWhispererConnection(AuthUtil.instance.conn)

    getLogger().debug(`DEBUG: createCodeWhispererChatClient - isConnected = ${isConnected}`)
    getLogger().debug(`DEBUG: createCodeWhispererChatClient - isValid = ${isValid}`)
    getLogger().debug(`DEBUG: createCodeWhispererChatClient - isExpired = ${isExpired}`)
    getLogger().debug(`DEBUG: createCodeWhispererChatClient - isValidConnection = ${isValidConnection}`)
}
