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
    SAM_INIT_RUNTIME_KEY,
    SAM_INIT_IMAGE_BOOLEAN_KEY,
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

describe('ActivationReloadState', async function() {
    let extensionContext: FakeExtensionContext
    let activationReloadState: ActivationReloadState

    beforeEach(function() {
        extensionContext = new FakeExtensionContext()
        activationReloadState = new TestActivationReloadState(extensionContext)
    })

    describe('setSamInitState', async function() {
        it('without runtime', async function() {
            activationReloadState.setSamInitState({
                path: 'somepath',
                runtime: undefined,
                isImage: false,
            })

            assert.strictEqual(
                extensionContext.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                extensionContext.globalState.get(SAM_INIT_RUNTIME_KEY),
                undefined,
                'Unexpected init runtime key value was set'
            )
            assert.strictEqual(
                extensionContext.globalState.get(SAM_INIT_IMAGE_BOOLEAN_KEY),
                false,
                'Unexpected init image boolean value was set'
            )
        })

        it('with runtime', async function() {
            activationReloadState.setSamInitState({
                path: 'somepath',
                runtime: 'someruntime',
                isImage: false,
            })

            assert.strictEqual(
                extensionContext.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                extensionContext.globalState.get(SAM_INIT_RUNTIME_KEY),
                'someruntime',
                'Unexpected init runtime value was set'
            )
            assert.strictEqual(
                extensionContext.globalState.get(SAM_INIT_IMAGE_BOOLEAN_KEY),
                false,
                'Unexpected init image boolean value was set'
            )
        })

        it('with image', async function() {
            activationReloadState.setSamInitState({
                path: 'somepath',
                runtime: 'someruntime',
                isImage: true,
            })

            assert.strictEqual(
                extensionContext.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                extensionContext.globalState.get(SAM_INIT_RUNTIME_KEY),
                'someruntime',
                'Unexpected init runtime value was set'
            )
            assert.strictEqual(
                extensionContext.globalState.get(SAM_INIT_IMAGE_BOOLEAN_KEY),
                true,
                'Unexpected init image boolean value was set'
            )
        })
    })

    describe('getSamInitState', async function() {
        it('path defined, without runtime', async function() {
            await extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, 'getsomepath')
            await extensionContext.globalState.update(SAM_INIT_RUNTIME_KEY, undefined)

            assert.strictEqual(
                activationReloadState.getSamInitState()?.path,
                'getsomepath',
                'Unexpected Launch Path value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.runtime,
                undefined,
                'Unexpected init runtime value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.isImage,
                undefined,
                'Unexpected init image boolean value was retrieved'
            )
        })

        it('path defined, with runtime', async function() {
            await extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, 'getsomepath')
            await extensionContext.globalState.update(SAM_INIT_RUNTIME_KEY, 'getsomeruntime')

            assert.strictEqual(
                activationReloadState.getSamInitState()?.path,
                'getsomepath',
                'Unexpected Launch Path value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.runtime,
                'getsomeruntime',
                'Unexpected init runtime value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.isImage,
                undefined,
                'Unexpected init image boolean value was retrieved'
            )
        })

        it('path defined, with runtime and isImage', async function() {
            await extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, 'getsomepath')
            await extensionContext.globalState.update(SAM_INIT_RUNTIME_KEY, 'getsomeruntime')
            await extensionContext.globalState.update(SAM_INIT_IMAGE_BOOLEAN_KEY, true)

            assert.strictEqual(
                activationReloadState.getSamInitState()?.path,
                'getsomepath',
                'Unexpected Launch Path value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.runtime,
                'getsomeruntime',
                'Unexpected init runtime value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.isImage,
                true,
                'Unexpected init image boolean value was retrieved'
            )
        })

        it('path undefined', async function() {
            await extensionContext.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, undefined)

            assert.strictEqual(
                activationReloadState.getSamInitState(),
                undefined,
                'expected sam init state to be undefined'
            )
        })
    })

    it('clearLaunchPath', async function() {
        activationReloadState.setSamInitState({
            path: 'somepath',
            runtime: 'someruntime',
            isImage: true,
        })
        activationReloadState.clearSamInitState()

        assert.strictEqual(
            extensionContext.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
            undefined,
            'Expected launch path to be cleared (undefined)'
        )

        assert.strictEqual(
            extensionContext.globalState.get(SAM_INIT_RUNTIME_KEY),
            undefined,
            'Expected runtime key to be cleared (undefined)'
        )

        assert.strictEqual(
            extensionContext.globalState.get(SAM_INIT_IMAGE_BOOLEAN_KEY),
            undefined,
            'Expected isImage key to be cleared (undefined)'
        )
    })
})
