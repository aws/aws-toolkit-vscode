/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../shared/extensionGlobals'

interface SessionStorage {
    [key: string]: SessionInfo
}

export interface SessionInfo {
    // TODO, if it had a summarized name that was better for the UI
    name?: string
    history: string[]
}

export class Storage {
    /**
     * Weaverbird local storage layout is:
     * {
     *  "sessionId": {
     *      ...session info
     *  }
     * }
     */
    private sessionStorageKey = 'WeaverbirdSessionStorage'

    // TODO make private
    constructor(public readonly memento: vscode.Memento = globals.context.globalState) {}

    /**
     * Create Weaverbird session storage if it doesn't already exist
     */
    createSessionStorage(): Thenable<void> {
        const sessionStorage = this.memento.get<SessionStorage>(this.sessionStorageKey)
        if (!sessionStorage) {
            return this.memento.update(this.sessionStorageKey, {})
        }
        return Promise.resolve()
    }

    /**
     * Create a new session
     * @returns A thenable that resolves when the local storage is updated
     */
    async createSession(): Promise<string> {
        const sessionStorage = this.getSessionStorage()

        // TODO do we create this on the VSCode side or on the server side? server side probably makes the most sense
        const sessionId = '1234'

        // Re-generated? Answer the above TODO first
        if (sessionId in sessionStorage) {
            throw new Error()
        }

        const modifiedStorage = {
            ...sessionStorage,
            [sessionId]: {
                history: [],
            },
        }

        await this.memento.update(this.sessionStorageKey, modifiedStorage)

        return sessionId
    }

    /**
     * Update a given sessionId with newer sessionInfo
     * @param sessionId the session id you want to update
     * @param sessionInfo a partial of the parts of the session you want to update
     * @returns A thenable that resolves when the local storage is updated
     */
    updateSession(sessionId: string, sessionInfo: Partial<SessionInfo>): Thenable<void> {
        const sessionStorage = this.getSessionStorage()
        const currentSession = this.getSessionById(sessionStorage, sessionId)

        // Contains the new session info overlayed over the old session info
        const modifiedSession = {
            ...currentSession,
            ...sessionInfo,
        }

        // Contains the new storage info overlayed over the old storage info
        const modifiedStorage = {
            ...sessionStorage,
            [sessionId]: modifiedSession,
        }

        return this.memento.update(this.sessionStorageKey, modifiedStorage)
    }

    /**
     * Deletes a given Weaverbird session id.
     * If the session id is not found nothing happens
     * @throws Error if the session could not be found
     * @param sessionId the sessionId you want to delete
     * @returns A thenable that resolves when the local storage is updated
     */
    deleteSession(sessionId: string): Thenable<void> {
        const sessionStorage = this.getSessionStorage()
        delete sessionStorage[sessionId]
        return this.memento.update(this.sessionStorageKey, sessionStorage)
    }

    /**
     * Gets the session storage
     * @throws Error if the sessions storage hasn't been initialized yet
     * @returns the session storage
     */
    getSessionStorage(): SessionStorage {
        const sessionStorage = this.memento.get<SessionStorage>(this.sessionStorageKey)
        if (!sessionStorage) {
            // TODO throw error if we can't find the session storage before getting it
            throw new Error('Unable to find sessionStorage in memento')
        }

        // This is for sure found
        return sessionStorage
    }

    /**
     * Get the session info for a given sessionId from the sessionStorage
     * @param sessionStorage The session storage object you want to look into
     * @param sessionId The session id object
     * @throws Error if the sessionId is not in the sessionStorage object
     * @returns the sessionInfo for a given sessionId
     */
    getSessionById(sessionStorage: SessionStorage, sessionId: string): SessionInfo {
        if (!(sessionId in sessionStorage)) {
            throw new Error()
        }
        return sessionStorage[sessionId]
    }
}
