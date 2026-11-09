/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import fs from '../../../../shared/fs/fs'
import { TabBarController } from '../../../../codewhispererChat/controllers/chat/tabBarController'
import { Messenger } from '../../../../codewhispererChat/controllers/chat/messenger/messenger'

describe('TabBarController', function () {
    let tabBarController: TabBarController
    let writeFileStub: sinon.SinonStub

    beforeEach(function () {
        const messenger = sinon.createStubInstance(Messenger) as unknown as Messenger
        tabBarController = new TabBarController(messenger)
        writeFileStub = sinon.stub(fs, 'writeFile').resolves()
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('processSaveChat', function () {
        it('rejects write to uri that was not approved via save dialog', async function () {
            await tabBarController.processSaveChat({
                uri: '/tmp/malicious-path.md',
                serializedChat: 'evil content',
            })

            assert.ok(writeFileStub.notCalled, 'writeFile should not be called for unapproved URI')
        })

        it('allows write to uri that was previously approved', async function () {
            const approvedUri = '/home/user/workspace/chat-export.md'

            ;(tabBarController as any).pendingSaveUris.add(approvedUri)

            await tabBarController.processSaveChat({
                uri: approvedUri,
                serializedChat: '# Chat Export',
            })

            assert.ok(writeFileStub.calledOnce, 'writeFile should be called for approved URI')
            assert.strictEqual(writeFileStub.getCall(0).args[0], approvedUri)
            assert.strictEqual(writeFileStub.getCall(0).args[1], '# Chat Export')
        })

        it('does not allow reuse of an approved uri', async function () {
            const approvedUri = '/home/user/workspace/chat-export.md'
            ;(tabBarController as any).pendingSaveUris.add(approvedUri)

            // First call succeeds
            await tabBarController.processSaveChat({
                uri: approvedUri,
                serializedChat: 'content',
            })
            assert.ok(writeFileStub.calledOnce)

            // Second call with same URI is rejected (one-time use)
            await tabBarController.processSaveChat({
                uri: approvedUri,
                serializedChat: 'different content',
            })
            assert.ok(writeFileStub.calledOnce, 'writeFile should not be called again for consumed URI')
        })
    })
})
