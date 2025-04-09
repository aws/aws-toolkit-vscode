/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import AsyncLock from 'async-lock'

export abstract class BaseChatSessionStorage<T extends { isAuthenticating: boolean }> {
    private lock = new AsyncLock()
    protected sessions: Map<string, T> = new Map()

    abstract createSession(tabID: string): Promise<T>

    public async getSession(tabID: string): Promise<T> {
        /**
         * The lock here is added in order to mitigate amazon Q's eventing fire & forget design when integrating with mynah-ui that creates a race condition here.
         * The race condition happens when handleDevFeatureCommand in src/amazonq/webview/ui/quickActions/handler.ts is firing two events after each other to amazonqFeatureDev controller
         * This eventually may make code generation fail as at the moment of that event it may get from the storage a session that has not been properly updated.
         */
        return this.lock.acquire(tabID, async () => {
            const sessionFromStorage = this.sessions.get(tabID)
            if (sessionFromStorage === undefined) {
                // If a session doesn't already exist just create it
                return this.createSession(tabID)
            }
            return sessionFromStorage
        })
    }

    // Find all sessions that are currently waiting to be authenticated
    public getAuthenticatingSessions(): T[] {
        return Array.from(this.sessions.values()).filter((session) => session.isAuthenticating)
    }

    public deleteSession(tabID: string) {
        this.sessions.delete(tabID)
    }

    public deleteAllSessions() {
        this.sessions.clear()
    }
}
