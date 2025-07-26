/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    GenerateResourceRequestMessage,
    GenerateResourceResponseMessage,
    WebviewContext,
    Command,
    MessageType,
} from '../types'
import { getLogger } from '../../shared/logger/logger'
import request from '../../shared/request'
import { isLocalDev, localhost, cdn } from '../constants'

export async function generateResourceHandler(request: GenerateResourceRequestMessage, context: WebviewContext) {
    try {
        const { chatResponse, references, metadata, isSuccess } = await fetchExampleResource(request.cfnType)

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

async function fetchExampleResource(cfnType: string) {
    try {
        const source = isLocalDev ? localhost : cdn
        const resp = request.fetch('GET', `${source}/examples/${convertCFNType(cfnType)}.json`, {})
        return {
            chatResponse: await (await resp.response).text(),
            references: [],
            metadata: {},
            isSuccess: true,
        }
    } catch (error: any) {
        getLogger().debug(`Resource fetch error: ${error.name} - ${error.message}`)
        if (error.$metadata) {
            const { requestId, cfId, extendedRequestId } = error.$metadata
            getLogger().debug('%O', { requestId, cfId, extendedRequestId })
        }

        throw error
    }
}

function convertCFNType(cfnType: string): string {
    const resourceParts = cfnType.split('::')
    if (resourceParts.length !== 3) {
        throw new Error('CFN type did not contain three parts')
    }

    return resourceParts.join('_')
}
