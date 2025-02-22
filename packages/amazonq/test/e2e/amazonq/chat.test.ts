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
import { waitUntil } from 'aws-core-vscode/shared'

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
    beforeEach(async () => {
        // Make sure you're logged in before every test
        registerAuthHook('amazonq-test-account')
        framework = new qTestingFramework('cwc', true, [])
        tab = framework.createTab()

        /**
         * Since sending messages to the UI is asynchronous, race conditions can occur
         * where the event is set but not fully loaded. Instead of checking the store directly,
         * we now use the tab title as a proxy to determine when the tab is fully ready
         */
        const ok = await waitUntil(
            async () => {
                return tab.getStore().tabTitle === 'Chat'
            },
            {
                interval: 50,
                timeout: 5000,
            }
        )
        if (!ok) {
            assert.fail('Chat tab failed to load')
        }
        store = tab.getStore()
    })

    afterEach(function () {
        if (this.currentTest?.state === undefined || this.currentTest?.isFailed() || this.currentTest?.isPending()) {
            console.table({
                'chat items': JSON.stringify(store.chatItems),
                'is chat loading': store.loadingChat,
                'tab title': store.tabTitle,
                'prompt input placeholder': store.promptInputPlaceholder,
                'quick actions': JSON.stringify(store.quickActionCommands),
                'context commands': JSON.stringify(store.contextCommands),
                'tab count': framework.getTabs().length,
            })
        }
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

    it('Clicks help', async () => {
        tab.clickButton('help')
        await tab.waitForText(webviewConstants.helpMessage)
        const chatItems = tab.getChatItems()
        assert.deepStrictEqual(chatItems[4].type, 'answer')
        assert.deepStrictEqual(chatItems[4].body, webviewConstants.helpMessage)
    })
})
