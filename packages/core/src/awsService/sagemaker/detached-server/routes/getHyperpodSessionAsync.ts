/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { getHyperpodFreshEntry, getHyperpodRequestStatus } from '../hyperpodMappingUtils'

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

        // not-started or consumed — session not available
        res.writeHead(202, { 'Content-Type': 'text/plain' })
        res.end('Session is not ready yet. Please retry in a few seconds.')
    } catch (err) {
        console.error('Error handling HyperPod session async request:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Unexpected error')
    }
}
