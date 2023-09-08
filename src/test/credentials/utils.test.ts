/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { ExtensionUse } from '../../auth/utils'

describe('ExtensionUse.isFirstUse()', function () {
    let fakeState: vscode.Memento
    let instance: ExtensionUse

    beforeEach(async function () {
        fakeState = (await FakeExtensionContext.create()).globalState
        instance = new ExtensionUse()
        fakeState.update(ExtensionUse.instance.isExtensionFirstUseKey, true)
    })

    it('is true only on first startup', function () {
        assert.strictEqual(instance.isFirstUse(fakeState), true, 'Failed on first call.')
        assert.strictEqual(instance.isFirstUse(fakeState), true, 'Failed on second call.')

        const nextStartup = nextExtensionStartup()
        assert.strictEqual(nextStartup.isFirstUse(fakeState), false, 'Failed on new startup.')
    })

    it('true when: (state value not exists + NOT has existing connections)', async function () {
        await makeStateValueNotExist()
        const notHasExistingConnections = () => false
        assert.strictEqual(
            instance.isFirstUse(fakeState, notHasExistingConnections),
            true,
            'No existing connections, should be first use'
        )
        assert.strictEqual(nextExtensionStartup().isFirstUse(fakeState), false)
    })

    it('false when: (state value not exists + has existing connections)', async function () {
        await makeStateValueNotExist()
        const hasExistingConnections = () => true
        assert.strictEqual(
            instance.isFirstUse(fakeState, hasExistingConnections),
            false,
            'Found existing connections, should not be first use'
        )
        assert.strictEqual(nextExtensionStartup().isFirstUse(fakeState), false)
    })

    /**
     * This makes the backend state value: undefined, mimicking a brand new user.
     * We use this state value to track if user is a first time user.
     */
    async function makeStateValueNotExist() {
        await fakeState.update(ExtensionUse.instance.isExtensionFirstUseKey, undefined)
    }

    /**
     * Mimics when the extension startsup a subsequent time (i.e user closes vscode and opens again).
     */
    function nextExtensionStartup() {
        return new ExtensionUse()
    }
})
