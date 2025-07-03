/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { SessionStore } from '../sessionStore'

export async function handleGetSessionAsync(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const connectionIdentifier = parsedUrl.query.connection_identifier as string
    const requestId = parsedUrl.query.request_id as string

    if (!connectionIdentifier || !requestId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(
            `Missing required query parameters: "connection_identifier" (${connectionIdentifier}), "request_id" (${requestId})`
        )
        return
    }

    const store = new SessionStore()

    try {
        const freshEntry = await store.getFreshEntry(connectionIdentifier, requestId)

        if (freshEntry) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
                JSON.stringify({
                    SessionId: freshEntry.sessionId,
                    StreamUrl: freshEntry.url,
                    TokenValue: freshEntry.token,
                })
            )
            return
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            res.end(
                `No session found for connection identifier: ${connectionIdentifier}. Reconnecting for deeplink is not supported yet.`
            )
            return
        }

        // Temporarily disabling reconnect logic for the 7/3 Phase 1 launch.
        // Will re-enable in the next release around 7/14.

        // const status = await store.getStatus(connectionIdentifier, requestId)
        // if (status === 'pending') {
        //     res.writeHead(204)
        //     res.end()
        //     return
        // } else if (status === 'not-started') {
        //     const serverInfo = await readServerInfo()
        //     const refreshUrl = await store.getRefreshUrl(connectionIdentifier)

        //     const url = `${refreshUrl}?connection_identifier=${encodeURIComponent(
        //         connectionIdentifier
        //     )}&request_id=${encodeURIComponent(requestId)}&call_back_url=${encodeURIComponent(
        //         `http://localhost:${serverInfo.port}/refresh_token`
        //     )}`

        //     await open(url)
        //     res.writeHead(202, { 'Content-Type': 'text/plain' })
        //     res.end('Session is not ready yet. Please retry in a few seconds.')
        //     await store.markPending(connectionIdentifier, requestId)
        //     return
        // }
    } catch (err) {
        console.error('Error handling session async request:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Unexpected error')
    }
}
