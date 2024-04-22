/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'

import { Messenger } from '../../../amazonqFeatureDev/controllers/chat/messenger/messenger'
import { ChatSessionStorage } from '../../../amazonqFeatureDev/storages/chatSession'
import { createMessenger } from '../utils'

describe('chatSession', () => {
    const tabID = '1234'
    let chatStorage: ChatSessionStorage
    let messenger: Messenger

    beforeEach(() => {
        messenger = createMessenger()
        chatStorage = new ChatSessionStorage(messenger)
    })

    it('locks getSession', async () => {
        const results = await Promise.allSettled([chatStorage.getSession(tabID), chatStorage.getSession(tabID)])
        assert.equal(results.length, 2)
        assert.deepStrictEqual(results[0], results[1])
    })
})
