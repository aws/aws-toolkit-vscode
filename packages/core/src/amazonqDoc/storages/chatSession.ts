/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseChatSessionStorage } from '../../amazonq/commons/baseChatStorage'
import { createSessionConfig } from '../../amazonq/commons/session/sessionConfigFactory'
import { docScheme } from '../constants'
import { DocMessenger } from '../messenger'
import { Session } from '../session/session'

export class DocChatSessionStorage extends BaseChatSessionStorage<Session> {
    constructor(protected readonly messenger: DocMessenger) {
        super()
    }

    override async createSession(tabID: string): Promise<Session> {
        const sessionConfig = await createSessionConfig(docScheme)
        const session = new Session(sessionConfig, this.messenger, tabID)
        this.sessions.set(tabID, session)
        return session
    }
}
