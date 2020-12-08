/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as vscode from 'vscode'
import {
    ACTIVATION_LAUNCH_PATH_KEY,
    ActivationReloadState,
    SAM_INIT_IMAGE_RUNTIME_KEY,
} from '../../shared/activationReloadState'
import { FakeExtensionContext } from '../fakeExtensionContext'

class TestActivationReloadState extends ActivationReloadState {
    public constructor(private readonly context: vscode.ExtensionContext) {
        super()
    }

    protected get extensionContext(): vscode.ExtensionContext {
        return this.context
    }
}

describe('ActivationReloadState', async () => {
    let extensionContext: FakeExtensionContext
    let activationReloadState: ActivationReloadState

    beforeEach(() => {
        extensionContext = new FakeExtensionContext()
        activationReloadState = new TestActivationReloadState(extensionContext)
    })

    describe('setSamInitState', async () => {
        it('without runtime', async () => {
            activationReloadState.setSamInitState({
                path: 'somepath',
                imageRuntime: undefined,
            })

            assert.strictEqual(
                extensionContext.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                extensionContext.globalState.get(SAM_INIT_IMAGE_RUNTIME_KEY),
                undefined,
                'Unexpected init image runtime key value was set'
            )
        })

        it('with runtime', async () => {
            activationReloadState.setSamInitState({
                path: 'somepath',
                imageRuntime: 'someruntime',
            })

            assert.strictEqual(
                extensionContext.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                extensionContext.globalState.get(SAM_INIT_IMAGE_RUNTIME_KEY),
                'someruntime',
                'Unexpected init image runtime value was set'
            )
        })
    })

    describe('getSamInitState', async () => {
        it('path defined, without runtime', async () => {
            await extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, 'getsomepath')
            await extensionContext.globalState.update(SAM_INIT_IMAGE_RUNTIME_KEY, undefined)

            assert.strictEqual(
                activationReloadState.getSamInitState()?.path,
                'getsomepath',
                'Unexpected Launch Path value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.imageRuntime,
                undefined,
                'Unexpected init image runtime value was retrieved'
            )
        })

        it('path defined, with runtime', async () => {
            await extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, 'getsomepath')
            await extensionContext.globalState.update(SAM_INIT_IMAGE_RUNTIME_KEY, 'getsomeruntime')

            assert.strictEqual(
                activationReloadState.getSamInitState()?.path,
                'getsomepath',
                'Unexpected Launch Path value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.imageRuntime,
                'getsomeruntime',
                'Unexpected init image runtime value was retrieved'
            )
        })

        it('path undefined', async () => {
            await extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, undefined)

            assert.strictEqual(
                activationReloadState.getSamInitState(),
                undefined,
                'expected sam init state to be undefined'
            )
        })
    })

    it('clearLaunchPath', async () => {
        activationReloadState.setSamInitState({
            path: 'somepath',
            imageRuntime: 'someruntime',
        })
        activationReloadState.clearSamInitState()

        assert.strictEqual(
            extensionContext.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
            undefined,
            'Expected launch path to be cleared (undefined)'
        )

        assert.strictEqual(
            extensionContext.globalState.get(SAM_INIT_IMAGE_RUNTIME_KEY),
            undefined,
            'Expected runtime key to be cleared (undefined)'
        )
    })
})
