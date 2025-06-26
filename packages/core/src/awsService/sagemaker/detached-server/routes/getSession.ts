/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import { startSagemakerSession, parseArn } from '../utils'
import { resolveCredentialsFor } from '../credentials'
import url from 'url'

export async function handleGetSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const connectionIdentifier = parsedUrl.query.connection_identifier as string

    if (!connectionIdentifier) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(`Missing required query parameter: "connection_identifier" (${connectionIdentifier})`)
        return
    }

    let credentials
    try {
        credentials = await resolveCredentialsFor(connectionIdentifier)
    } catch (err) {
        console.error('Failed to resolve credentials:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end((err as Error).message)
    }

    const { region } = parseArn(connectionIdentifier)

    try {
        const session = await startSagemakerSession({ region, connectionIdentifier, credentials })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
            JSON.stringify({
                SessionId: session.SessionId,
                StreamUrl: session.StreamUrl,
                TokenValue: session.TokenValue,
            })
        )
    } catch (err) {
        console.error(`Failed to start SageMaker session for ${connectionIdentifier}:`, err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Failed to start SageMaker session')
        return
    }
}
