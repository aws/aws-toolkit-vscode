/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import url from 'url'
import { readHyperpodMapping } from '../hyperpodMappingUtils'

export async function handleGetHyperpodSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const connectionKey = parsedUrl.query.connection_key as string

    if (!connectionKey) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Missing required query parameter: "connection_key"')
        return
    }

    let mapping
    try {
        const allMappings = await readHyperpodMapping()
        mapping = allMappings[connectionKey]
        if (!mapping) {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end(`No HyperPod connection found for key: "${connectionKey}"`)
            return
        }
    } catch (err) {
        console.error('Failed to read HyperPod mapping:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end(`Failed to read HyperPod connection mapping: ${(err as Error).message}`)
        return
    }

    if (!mapping.wsUrl || !mapping.token) {
        res.writeHead(401, { 'Content-Type': 'text/plain' })
        res.end('No stored session credentials for this HyperPod connection. Please reconnect from the IDE.')
        return
    }

    console.log(`Returning stored session credentials for ${connectionKey}`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
        JSON.stringify({
            SessionId: connectionKey,
            StreamUrl: mapping.wsUrl,
            TokenValue: mapping.token,
        })
    )
}
