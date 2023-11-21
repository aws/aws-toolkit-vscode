/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Messenger } from '../controllers/chat/messenger/messenger'
import { Session } from '../session/session'
import { createSessionConfig } from '../session/sessionConfigFactory'

export class ChatSessionStorage {
    private sessions: Map<string, Session> = new Map()

    constructor(private readonly messenger: Messenger) {}

    private async createSession(tabID: string): Promise<Session> {
        const sessionConfig = await createSessionConfig()
        const session = new Session(sessionConfig, this.messenger, tabID)
        this.sessions.set(tabID, session)
        return session
    }

    public async getSession(tabID: string): Promise<Session> {
        const sessionFromStorage = this.sessions.get(tabID)
        if (sessionFromStorage === undefined) {
            // If a session doesn't already exist just create it
            return this.createSession(tabID)
        }
        return sessionFromStorage
    }

    // Find all sessions that are currently waiting to be authenticated
    public getAuthenticatingSessions(): Session[] {
        return Array.from(this.sessions.values()).filter(session => session.isAuthenticating)
    }

    public deleteSession(tabID: string) {
        this.sessions.delete(tabID)
    }
}
