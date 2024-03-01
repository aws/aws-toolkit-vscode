/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { createMessenger, createSession } from '../utils'
import { Session } from '../../../amazonqFeatureDev/session/session'
import { assertTelemetry } from '../../testUtil'

describe('session', () => {
    const conversationID = '12345'

    let session: Session

    beforeEach(async () => {
        const messenger = createMessenger()
        session = await createSession({ messenger, conversationID })
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('preloader', () => {
        it('emits start chat telemetry', async () => {
            await session.preloader('implement twosum in typescript')

            assertTelemetry('amazonq_startConversationInvoke', {
                amazonqConversationId: conversationID,
            })
        })
    })
})
