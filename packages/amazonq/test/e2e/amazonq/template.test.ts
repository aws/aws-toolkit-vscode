/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// jscpd:ignore-start
import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { Messenger } from './framework/messenger'
import { MynahUIDataModel } from '@aws/mynah-ui'
import { assertQuickActions } from './assert'
import { registerAuthHook, using } from 'aws-core-vscode/test'
import { loginToIdC } from './utils/setup'

describe.skip('Amazon Q Test Template', function () {
    let framework: qTestingFramework
    let tab: Messenger
    let store: MynahUIDataModel

    const availableCommands: string[] = []

    before(async function () {
        /**
         * Login to the amazonq-test-account. When running in CI this has unlimited
         * calls to the backend api
         */
        await using(registerAuthHook('amazonq-test-account'), async () => {
            await loginToIdC()
        })
    })

    beforeEach(() => {
        // Make sure you're logged in before every test
        registerAuthHook('amazonq-test-account')

        // TODO change unknown to the tab type you want to test
        framework = new qTestingFramework('unknown', true, [])
        tab = framework.getTabs()[0] // use the default tab that gets created
        framework.createTab() // alternatively you can create a new tab
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

    it('Shows title', () => {
        assert.deepStrictEqual(store.tabTitle, '')
    })

    it('Shows placeholder', () => {
        assert.deepStrictEqual(store.promptInputPlaceholder, '')
    })

    describe('clicks examples', () => {})

    describe('sends message', async () => {})
})

/* jscpd:ignore-end */
