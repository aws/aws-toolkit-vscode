/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { getHyperpodFreshEntry, getHyperpodRequestStatus } from '../hyperpodMappingUtils'
import { handleGetHyperpodSession } from './getHyperpodSession'

export async function handleGetHyperpodSessionAsync(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const connectionKey = parsedUrl.query.connection_key as string
    const requestId = (parsedUrl.query.request_id as string) || 'initial-connection'

    if (!connectionKey) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Missing required query parameter: "connection_key"')
        return
    }

    try {
        const freshEntry = await getHyperpodFreshEntry(connectionKey, requestId)

        if (freshEntry) {
            const body = { SessionId: freshEntry.sessionId, StreamUrl: freshEntry.url, TokenValue: freshEntry.token }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(body))
            return
        }

        const status = await getHyperpodRequestStatus(connectionKey, requestId)
        if (status === 'pending') {
            res.writeHead(204)
            res.end()
            return
        }

        // consumed or not-started — fall back to localCredential/kubectl reconnection path
        // which also handles browser-based reconnection via refreshUrl
        await handleGetHyperpodSession(req, res)
    } catch (err) {
        console.error('Error handling HyperPod session async request:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Unexpected error')
    }
}
