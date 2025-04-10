/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatSession } from '../clients/chat/v0/chat'

export class ChatSessionStorage {
    private sessions: Map<string, ChatSession> = new Map()
    private agentLoopInProgress: Map<string, boolean> = new Map()

    public getSession(tabID: string): ChatSession {
        const sessionFromStorage = this.sessions.get(tabID)
        if (sessionFromStorage !== undefined) {
            return sessionFromStorage
        }

        const newSession = new ChatSession()
        this.sessions.set(tabID, newSession)

        return newSession
    }

    public deleteSession(tabID: string) {
        this.sessions.delete(tabID)
        this.agentLoopInProgress.delete(tabID)
    }

    /**
     * Check if agent loop is in progress for a specific tab
     * @param tabID The tab ID to check
     * @returns True if agent loop is in progress, false otherwise
     */
    public isAgentLoopInProgress(tabID: string): boolean {
        return this.agentLoopInProgress.get(tabID) === true
    }

    /**
     * Set agent loop in progress state for a specific tab
     * @param tabID The tab ID to set state for
     * @param inProgress Whether the agent loop is in progress
     */
    public setAgentLoopInProgress(tabID: string, inProgress: boolean): void {
        this.agentLoopInProgress.set(tabID, inProgress)
    }

    public deleteAllSessions() {
        this.sessions.clear()
    }
}
