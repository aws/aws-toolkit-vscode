/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * TODO[Gumby]: this needs to track only a single session
 */

import { Messenger } from '../controller/messenger/messenger'
import { Session } from '../session/session'

// TODO[gumby] this needs to track only a single session
// https://stackoverflow.com/questions/30174078/how-to-define-singleton-in-typescript
export class ChatSessionStorage {
    private sessions: Map<string, Session> = new Map()

    constructor(private readonly messenger: Messenger) {}

    private async createSession(tabID: string): Promise<Session> {
        const session = new Session(this.messenger, tabID)
        this.sessions.set(tabID, session)
        return session
    }

    public async getSession(tabID: string): Promise<Session> {
        const currentSession = this.sessions.get(tabID)
        if (currentSession === undefined) {
            // If a session doesn't already exist just create it
            return this.createSession(tabID)
        }
        return currentSession
    }

    // Find all sessions that are currently waiting to be authenticated
    public getAuthenticatingSessions(): Session[] {
        return Array.from(this.sessions.values()).filter(session => session.isAuthenticating)
    }

    public deleteSession(tabID: string) {
        this.sessions.delete(tabID)
    }
}
