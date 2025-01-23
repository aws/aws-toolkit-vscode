/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { Messenger } from './framework/messenger'
import { MynahUIDataModel } from '@aws/mynah-ui'
import { assertContextCommands, assertQuickActions } from './assert'
import { registerAuthHook, using } from 'aws-core-vscode/test'
import { loginToIdC } from './utils/setup'
import { webviewConstants } from 'aws-core-vscode/amazonq'

describe('Amazon Q Chat', function () {
    let framework: qTestingFramework
    let tab: Messenger
    let store: MynahUIDataModel

    const availableCommands: string[] = ['/dev', '/test', '/review', '/doc', '/transform']

    before(async function () {
        /**
         * Login to the amazonq-test-account. When running in CI this has unlimited
         * calls to the backend api
         */
        await using(registerAuthHook('amazonq-test-account'), async () => {
            await loginToIdC()
        })
    })

    // jscpd:ignore-start
    beforeEach(() => {
        // Make sure you're logged in before every test
        registerAuthHook('amazonq-test-account')
        framework = new qTestingFramework('cwc', true, [])
        tab = framework.createTab()
        store = tab.getStore()
    })

    afterEach(() => {
        framework.removeTab(tab.tabID)
        framework.dispose()
        sinon.restore()
    })

    it(`Shows quick actions: ${availableCommands.join(', ')}`, async () => {
        assertQuickActions(tab, availableCommands)
    })

    it('Shows @workspace', () => {
        assertContextCommands(tab, ['@workspace'])
    })

    // jscpd:ignore-end

    it('Shows title', () => {
        assert.deepStrictEqual(store.tabTitle, 'Chat')
    })

    it('Shows placeholder', () => {
        assert.deepStrictEqual(store.promptInputPlaceholder, 'Ask a question or enter "/" for quick actions')
    })

    it('Sends message', async () => {
        tab.addChatMessage({
            prompt: 'What is a lambda',
        })
        await tab.waitForChatFinishesLoading()
        const chatItems = tab.getChatItems()
        // the last item should be an answer
        assert.deepStrictEqual(chatItems[4].type, 'answer')
    })

    describe('Clicks examples', () => {
        it('Click help', async () => {
            tab.clickButton('help')
            await tab.waitForText(webviewConstants.helpMessage)
            const chatItems = tab.getChatItems()
            assert.deepStrictEqual(chatItems[4].type, 'answer')
            assert.deepStrictEqual(chatItems[4].body, webviewConstants.helpMessage)
        })
    })
})
