/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { SessionStore } from '../sessionStore'

export async function handleRefreshToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const connectionIdentifier = parsedUrl.query.connection_identifier as string
    const requestId = parsedUrl.query.request_id as string
    const wsUrl = parsedUrl.query.ws_url as string
    const token = parsedUrl.query.token as string
    const sessionId = parsedUrl.query.session as string

    const store = new SessionStore()

    if (!connectionIdentifier || !requestId || !wsUrl || !token || !sessionId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(
            `Missing required parameters:\n` +
                `  connection_identifier: ${connectionIdentifier ?? 'undefined'}\n` +
                `  request_id: ${requestId ?? 'undefined'}\n` +
                `  url: ${wsUrl ?? 'undefined'}\n` +
                `  token: ${token ?? 'undefined'}\n` +
                `  sessionId: ${sessionId ?? 'undefined'}`
        )
        return
    }

    try {
        await store.setSession(connectionIdentifier, requestId, { sessionId, token, url: wsUrl })
    } catch (err) {
        console.error('Failed to save session token:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Failed to save session token')
        return
    }

    res.writeHead(200)
    res.end('Session token refreshed successfully')
}
