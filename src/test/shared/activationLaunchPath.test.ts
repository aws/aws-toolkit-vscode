/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as vscode from 'vscode'
import { ActivationLaunchPath } from '../../shared/activationLaunchPath'
import { FakeExtensionContext } from '../fakeExtensionContext'

const GLOBAL_STATE_KEY = 'ACTIVATION_LAUNCH_PATH_KEY'

class TestActivationLaunchPath extends ActivationLaunchPath {
    public constructor(private readonly context: vscode.ExtensionContext) {
        super()
    }

    protected get extensionContext(): vscode.ExtensionContext {
        return this.context
    }
}

describe('ActivationLaunchPath', async () => {
    let extensionContext: FakeExtensionContext
    let activationLaunchPath: ActivationLaunchPath

    beforeEach(() => {
        extensionContext = new FakeExtensionContext()
        activationLaunchPath = new TestActivationLaunchPath(extensionContext)
    })

    it('setLaunchPath', async () => {
        activationLaunchPath.setLaunchPath('somepath')

        assert.strictEqual(
            extensionContext.globalState.get(GLOBAL_STATE_KEY),
            'somepath',
            'Unexpected Launch Path value was set'
        )
    })

    it('getLaunchPath', async () => {
        await extensionContext.globalState.update(GLOBAL_STATE_KEY, 'getsomepath')

        assert.strictEqual(
            activationLaunchPath.getLaunchPath(),
            'getsomepath',
            'Unexpected Launch Path value was retrieved'
        )
    })

    it('clearLaunchPath', async () => {
        activationLaunchPath.setLaunchPath('somepath')
        activationLaunchPath.clearLaunchPath()

        assert.strictEqual(
            extensionContext.globalState.get(GLOBAL_STATE_KEY),
            undefined,
            'Expected value to be cleared (undefined)'
        )
    })
})
