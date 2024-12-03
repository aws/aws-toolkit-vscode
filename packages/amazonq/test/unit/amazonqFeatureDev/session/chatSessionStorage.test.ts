/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { FeatureDevChatSessionStorage } from 'aws-core-vscode/amazonqFeatureDev'
import { Messenger } from 'aws-core-vscode/amazonq'
import { createMessenger } from 'aws-core-vscode/test'

describe('chatSession', () => {
    const tabID = '1234'
    let chatStorage: FeatureDevChatSessionStorage
    let messenger: Messenger

    beforeEach(() => {
        messenger = createMessenger()
        chatStorage = new FeatureDevChatSessionStorage(messenger)
    })

    it('locks getSession', async () => {
        const results = await Promise.allSettled([chatStorage.getSession(tabID), chatStorage.getSession(tabID)])
        assert.equal(results.length, 2)
        assert.deepStrictEqual(results[0], results[1])
    })
})
