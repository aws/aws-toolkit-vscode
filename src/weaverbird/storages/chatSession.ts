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

    public async getSession(tabID: string): Promise<Session> {
        const sessionFromStorage = this.sessions.get(tabID)
        if (sessionFromStorage !== undefined) {
            return sessionFromStorage
        }

        const sessionConfig = await createSessionConfig()
        const session = new Session(sessionConfig, this.messenger, tabID)
        this.sessions.set(tabID, session)

        return session
    }
}
