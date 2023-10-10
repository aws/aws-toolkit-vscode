/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import fetch from 'node-fetch'
import { Response } from 'node-fetch'
import * as model from './model'

const chatServiceUrl = 'https://beta-chat.mynah.dx.aws.dev'
const sessionIDHeader = 'x-codewhisperer-chat-session-id'
const chatUrl: URL = new URL(`${chatServiceUrl}/api/chat`)
const followUpUrl: URL = new URL(`${chatServiceUrl}/api/follow-up`)
const ideTriggerUrl: URL = new URL(`${chatServiceUrl}/api/ide-trigger`)

async function* linesAsyncIterator(response: Response) {
    let chunks = ''
    for await (const chunk of response.body!) {
        chunks += chunk
        const lines = chunks.split('\n')
        for (const line of lines.slice(0, -1)) {
            yield line
        }
        chunks = lines.slice(-1)[0]
    }
    if (chunks != '') {
        yield chunks
    }
}

export class ChatSession {
    private sessionId?: string

    constructor(private readonly apiKey: string) {}

    async *send(request: string, url: URL): AsyncGenerator<model.ChatEvent, any, any> {
        const requestInit = {
            body: request,
            method: 'POST',
            headers: [
                ['x-amzn-requester', 'AWS Toolkits VSCode'],
                ['x-codewhisperer-chat-api-key', this.apiKey],
                ['Content-Type', 'application/json'],
            ],
        }

        if (this.sessionId !== undefined) {
            requestInit.headers.push([sessionIDHeader, this.sessionId])
        }

        const resp = await fetch(url, requestInit)

        this.sessionId = resp.headers.get(sessionIDHeader)!

        for await (const line of linesAsyncIterator(resp)) {
            if (line.trim() == '') {
                continue
            }

            const chatEvent: model.ChatEvent = JSON.parse(line.slice(6))
            yield chatEvent
        }
    }

    async *chat(request: model.ChatRequest): AsyncGenerator<model.ChatEvent, any, any> {
        const lines = this.send(JSON.stringify(request), chatUrl)
        for await (const line of lines) {
            yield line
        }
    }

    async *followUp(request: model.FollowUpRequest): AsyncGenerator<model.ChatEvent, any, any> {
        const lines = this.send(JSON.stringify(request), followUpUrl)
        for await (const line of lines) {
            yield line
        }
    }

    async *ideTrigger(request: model.IdeTriggerRequest): AsyncGenerator<model.ChatEvent, any, any> {
        const lines = this.send(JSON.stringify(request), ideTriggerUrl)
        for await (const line of lines) {
            yield line
        }
    }
}
