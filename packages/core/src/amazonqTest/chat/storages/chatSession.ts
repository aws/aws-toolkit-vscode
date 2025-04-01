/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import { Session } from '../session/session'
import { getLogger } from '../../../shared/logger/logger'

export class SessionNotFoundError extends Error {}

export class ChatSessionManager {
    private static _instance: ChatSessionManager
    private activeSession: Session | undefined
    private isInProgress: boolean = false

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

    public getIsInProgress(): boolean {
        return this.isInProgress
    }

    public setIsInProgress(value: boolean): void {
        this.isInProgress = value
    }

    public setActiveTab(tabID: string): string {
        getLogger().debug(`Setting active tab: ${tabID}, activeSession: ${this.activeSession}`)
        if (this.activeSession !== undefined) {
            this.activeSession.tabID = tabID
            return tabID
        }

        throw new SessionNotFoundError()
    }

    public removeActiveTab(): void {
        getLogger().debug(`Removing active tab and deleting activeSession: ${this.activeSession}`)
        if (this.activeSession !== undefined) {
            this.activeSession.tabID = undefined
            this.activeSession = undefined
        }
    }
}
