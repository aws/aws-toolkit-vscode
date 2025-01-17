/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { Messenger } from './framework/messenger'
import { MynahUIDataModel } from '@aws/mynah-ui'
import { assertQuickActions } from './assert'
import { FeatureContext } from 'aws-core-vscode/shared'

describe('Amazon Q Welcome page', function () {
    let framework: qTestingFramework
    let tab: Messenger
    let store: MynahUIDataModel

    const availableCommands = ['/dev', '/test', '/review', '/doc', '/transform']

    const highlightCommand: FeatureContext = {
        name: 'highlightCommand',
        value: {
            stringValue: '@highlight',
        },
        variation: 'highlight command desc',
    }
    beforeEach(() => {
        framework = new qTestingFramework('welcome', true, [['highlightCommand', highlightCommand]], 0)
        tab = framework.getTabs()[0] // use the default tab that gets created
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

    it('Shows context commands', async () => {
        assert.deepStrictEqual(
            store.contextCommands
                ?.map((x) => x.commands)
                .flat()
                .map((x) => x.command),
            ['@workspace', '@highlight']
        )
    })

    describe('shows 3 times', async () => {
        it('new tabs', () => {
            framework.createTab()
            framework.createTab()
            framework.createTab()
            framework.createTab()

            let welcomeCount = 0
            for (const tab of framework.getTabs()) {
                if (tab.getStore().tabTitle === 'Welcome to Q') {
                    welcomeCount++
                }
            }
            // 3 welcome tabs
            assert.deepStrictEqual(welcomeCount, 3)

            // 2 normal tabs
            assert.deepStrictEqual(framework.getTabs().length - welcomeCount, 2)
        })

        it('new windows', () => {
            // check the initial window
            assert.deepStrictEqual(store.tabTitle, 'Welcome to Q')
            framework.dispose()

            // check when theres already been two welcome tabs shown
            framework = new qTestingFramework('welcome', true, [], 2)
            const secondStore = framework.getTabs()[0].getStore()
            assert.deepStrictEqual(secondStore.tabTitle, 'Welcome to Q')
            framework.dispose()

            // check when theres already been three welcome tabs shown
            framework = new qTestingFramework('welcome', true, [], 3)
            const thirdStore = framework.getTabs()[0].getStore()
            assert.deepStrictEqual(thirdStore.tabTitle, 'Chat')
            framework.dispose()
        })
    })

    describe('Welcome actions', () => {
        it('explore', () => {
            tab.clickInBodyButton('explore')

            // explore opens in a new tab
            const exploreTabStore = framework.findTab('Explore')?.getStore()
            assert.strictEqual(exploreTabStore?.tabTitle, 'Explore')
        })

        it('quick-start', async () => {
            tab.clickInBodyButton('quick-start')

            // clicking quick start opens in the current tab and changes the compact mode
            assert.deepStrictEqual(tab.getStore().compactMode, false)
        })
    })
})
