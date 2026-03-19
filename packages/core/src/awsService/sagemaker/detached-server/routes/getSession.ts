/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Disabled: detached server files cannot import vscode.
/* eslint-disable aws-toolkits/no-console-log */
import { IncomingMessage, ServerResponse } from 'http'
import { startSagemakerSession, isSmusConnection, isSmusIamConnection } from '../utils'
import { parseArn } from '../utils'
import { resolveCredentialsFor } from '../credentials'
import url from 'url'
import { SageMakerServiceException } from '@amzn/sagemaker-client'
import { getVSCodeErrorText, getVSCodeErrorTitle, openErrorPage } from '../errorPage'

const maxRetries = 8
const attemptCount = new Map<string, number>()
const lastAttemptTime = new Map<string, number>()
const resetWindowMs = 10 * 60 * 1000

export async function handleGetSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '', true)
    const connectionIdentifier = parsedUrl.query.connection_identifier as string

    if (!connectionIdentifier) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(`Missing required query parameter: "connection_identifier" (${connectionIdentifier})`)
        return
    }

    const now = Date.now()
    if (now - (lastAttemptTime.get(connectionIdentifier) ?? 0) > resetWindowMs) {
        attemptCount.set(connectionIdentifier, 0)
    }
    lastAttemptTime.set(connectionIdentifier, now)
    const count = (attemptCount.get(connectionIdentifier) ?? 0) + 1
    attemptCount.set(connectionIdentifier, count)

    if (count > maxRetries) {
        console.log(`Retry cap reached for ${connectionIdentifier} (${count}/${maxRetries})`)
        res.writeHead(429, { 'Content-Type': 'text/plain' })
        res.end('Too many retry attempts. Please reconnect manually.')
        return
    }

    let credentials
    try {
        credentials = await resolveCredentialsFor(connectionIdentifier)
    } catch (err) {
        console.error('Failed to resolve credentials:', err)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end((err as Error).message)
        return
    }

    const { region } = parseArn(connectionIdentifier)
    const isSmus = await isSmusConnection(connectionIdentifier)
    const isSmusIamConn = await isSmusIamConnection(connectionIdentifier)

    try {
        const session = await startSagemakerSession({ region, connectionIdentifier, credentials })
        attemptCount.delete(connectionIdentifier)
        lastAttemptTime.delete(connectionIdentifier)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
            JSON.stringify({
                SessionId: session.SessionId,
                StreamUrl: session.StreamUrl,
                TokenValue: session.TokenValue,
            })
        )
    } catch (err) {
        const error = err as SageMakerServiceException
        console.error(`Failed to start SageMaker session for ${connectionIdentifier}:`, err)
        const errorTitle = getVSCodeErrorTitle(error)
        const errorText = getVSCodeErrorText(error, isSmus, isSmusIamConn)
        await openErrorPage(errorTitle, errorText)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Failed to start SageMaker session')
        return
    }
}
