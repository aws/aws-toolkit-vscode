/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseChatSessionStorage } from '../../amazonq/commons/baseChatStorage'
import { Messenger } from '../../amazonq/commons/connector/baseMessenger'
import { createSessionConfig } from '../../amazonq/commons/session/sessionConfigFactory'
import { featureDevScheme } from '../constants'
import { Session } from '../session/session'

export class FeatureDevChatSessionStorage extends BaseChatSessionStorage<Session> {
    constructor(protected readonly messenger: Messenger) {
        super()
    }

    override async createSession(tabID: string): Promise<Session> {
        const sessionConfig = await createSessionConfig(featureDevScheme)
        const session = new Session(sessionConfig, this.messenger, tabID)
        this.sessions.set(tabID, session)
        return session
    }
}
