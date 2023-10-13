/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatSession } from '../clients/chat/v0/chat'

export class ChatSessionStorage {
    private sessions: Map<string, ChatSession> = new Map()

    public getSession(tabID: string): ChatSession {
        const sessionFromStorage = this.sessions.get(tabID)
        if (sessionFromStorage !== undefined) {
            return sessionFromStorage
        }

        const newSession = new ChatSession('f7baecc9fb5779d04f0ac73c75180ca6-mynah-team-dev')
        this.sessions.set(tabID, newSession)

        return newSession
    }

    public deleteSession(tabID: string) {
        this.sessions.delete(tabID)
    }
}
