/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import { Session } from '../session/session'

export class SessionNotFoundError extends Error {}

export class ChatSessionManager {
    private static _instance: ChatSessionManager
    private activeSession: Session | undefined

    constructor() {}

    public static get Instance() {
        return this._instance || (this._instance = new this())
    }

    private createSession(): Session {
        this.activeSession = new Session()
        return this.activeSession
    }

    public getSession(): Session {
        if (this.activeSession === undefined) {
            return this.createSession()
        }

        return this.activeSession
    }

    public setActiveTab(tabID: string): string {
        if (this.activeSession !== undefined) {
            if (!this.activeSession.isTabOpen()) {
                this.activeSession.tabID = tabID
                return tabID
            }
            return this.activeSession.tabID!
        }

        throw new SessionNotFoundError()
    }

    public removeActiveTab(): void {
        if (this.activeSession !== undefined) {
            if (this.activeSession.isTabOpen()) {
                this.activeSession.tabID = undefined
                return
            }
        }
    }
}
