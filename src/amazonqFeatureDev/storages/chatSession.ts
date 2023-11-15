/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Messenger } from '../controllers/chat/messenger/messenger'
import { SessionNotFoundError } from '../errors'
import { Session } from '../session/session'
import { createSessionConfig } from '../session/sessionConfigFactory'

export class ChatSessionStorage {
    private sessions: Map<string, Session> = new Map()

    constructor(private readonly messenger: Messenger) {}

    public async createSession(tabID: string): Promise<Session> {
        const sessionConfig = await createSessionConfig()
        const session = new Session(sessionConfig, this.messenger, tabID)
        this.sessions.set(tabID, session)
        return session
    }

    public async getSession(tabID: string): Promise<Session> {
        const sessionFromStorage = this.sessions.get(tabID)
        if (sessionFromStorage === undefined) {
            throw new SessionNotFoundError()
        }
        return sessionFromStorage
    }

    public deleteSession(tabID: string) {
        this.sessions.delete(tabID)
    }
}
