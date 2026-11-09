/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { getHyperpodFreshEntry, getHyperpodRequestStatus, readHyperpodMapping } from '../hyperpodMappingUtils'
import { open, readServerInfo } from '../utils'

const pendingBrowserReconnects = new Map<string, { requestId: string; timestamp: number }>()

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
        // Check if a pending browser reconnection has delivered fresh credentials
        const pending = pendingBrowserReconnects.get(connectionKey)
        if (pending) {
            const freshEntry = await getHyperpodFreshEntry(connectionKey, pending.requestId)
            if (freshEntry) {
                pendingBrowserReconnects.delete(connectionKey)
                const body = {
                    SessionId: freshEntry.sessionId,
                    StreamUrl: freshEntry.url,
                    TokenValue: freshEntry.token,
                }
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify(body))
                return
            }
            // Still waiting — tell ProxyCommand to retry
            res.writeHead(202, { 'Content-Type': 'text/plain' })
            res.end('Browser reconnection in progress. Please retry.')
            return
        }

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

        // consumed or not-started — trigger browser reconnection if refreshUrl available
        await triggerBrowserReconnectionAsync(connectionKey, res)
    } catch (err) {
        console.error('Error handling HyperPod session async request:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Unexpected error')
    }
}

function isValidReconnectUrl(refreshUrl: string): boolean {
    try {
        const parsed = new URL(refreshUrl)
        if (parsed.protocol === 'http:') {
            return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
        }
        if (parsed.protocol === 'https:') {
            return parsed.hostname.endsWith('.sagemaker.aws') || parsed.hostname.endsWith('.asfiovnxocqpcry.com')
        }
        return false
    } catch {
        return false
    }
}

async function triggerBrowserReconnectionAsync(connectionKey: string, res: ServerResponse): Promise<void> {
    try {
        const allMappings = await readHyperpodMapping()
        const mapping = allMappings.localCredential?.[connectionKey]

        if (!mapping?.refreshUrl) {
            res.writeHead(202, { 'Content-Type': 'text/plain' })
            res.end('Session is not ready yet. Please retry in a few seconds.')
            return
        }

        if (!isValidReconnectUrl(mapping.refreshUrl)) {
            console.error(`Invalid refreshUrl for ${connectionKey}: ${mapping.refreshUrl}`)
            res.writeHead(400, { 'Content-Type': 'text/plain' })
            res.end('Invalid reconnection URL.')
            return
        }

        const serverInfo = await readServerInfo()
        const reconnectRequestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

        const callbackUrl = `http://localhost:${serverInfo.port}/refresh_token`
        const separator = mapping.refreshUrl.includes('?') ? '&' : '?'
        const reconnectUrl = `${mapping.refreshUrl}${separator}reconnect_callback_url=${encodeURIComponent(callbackUrl)}&reconnect_request_id=${encodeURIComponent(reconnectRequestId)}&connection_identifier=${encodeURIComponent(connectionKey)}`

        pendingBrowserReconnects.set(connectionKey, { requestId: reconnectRequestId, timestamp: Date.now() })

        console.log(`Opening browser for HyperPod reconnection (async): ${connectionKey}`)
        await open(reconnectUrl)

        res.writeHead(202, { 'Content-Type': 'text/plain' })
        res.end('Browser reconnection initiated. Please retry.')
    } catch (err) {
        console.error(`Failed to trigger browser reconnection for ${connectionKey}:`, err)
        res.writeHead(202, { 'Content-Type': 'text/plain' })
        res.end('Session is not ready yet. Please retry in a few seconds.')
    }
}
