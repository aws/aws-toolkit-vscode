/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import assert from 'assert'
import { ActivationReloadState } from '../../shared/activationReloadState'
import globals, { checkDidReload } from '../../shared/extensionGlobals'

describe('ActivationReloadState', async function () {
    const activationReloadState = new ActivationReloadState()

    beforeEach(function () {
        activationReloadState.clearSamInitState()
    })

    afterEach(function () {
        activationReloadState.clearSamInitState()
    })

    it('decides globals.didReload', async function () {
        await globals.globalState.update('ACTIVATION_LAUNCH_PATH_KEY', undefined)
        assert.strictEqual(checkDidReload(globals.context), false)

        await globals.globalState.update('ACTIVATION_LAUNCH_PATH_KEY', '/some/path')
        assert.strictEqual(checkDidReload(globals.context), true)
    })

    describe('setSamInitState', async function () {
        it('without runtime', async function () {
            activationReloadState.setSamInitState({
                template: 'sometemplate',
                readme: 'somepath',
                runtime: undefined,
                isImage: false,
                architecture: 'arm64',
            })

            assert.strictEqual(
                globals.globalState.get('ACTIVATION_LAUNCH_PATH_KEY'),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                globals.globalState.get('ACTIVATION_TEMPLATE_PATH_KEY'),
                'sometemplate',
                'Unexpected Template Path value was set'
            )
            assert.strictEqual(
                globals.globalState.get('SAM_INIT_RUNTIME_KEY'),
                undefined,
                'Unexpected init runtime key value was set'
            )
            assert.strictEqual(
                globals.globalState.get('SAM_INIT_IMAGE_BOOLEAN_KEY'),
                false,
                'Unexpected init image boolean value was set'
            )
        })

        it('with runtime', async function () {
            activationReloadState.setSamInitState({
                template: 'sometemplate',
                readme: 'somepath',
                runtime: 'someruntime',
                isImage: false,
                architecture: 'arm64',
            })

            assert.strictEqual(
                globals.globalState.get('ACTIVATION_LAUNCH_PATH_KEY'),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                globals.globalState.get('ACTIVATION_TEMPLATE_PATH_KEY'),
                'sometemplate',
                'Unexpected Template Path value was set'
            )
            assert.strictEqual(
                globals.globalState.get('SAM_INIT_RUNTIME_KEY'),
                'someruntime',
                'Unexpected init runtime value was set'
            )
            assert.strictEqual(
                globals.globalState.get('SAM_INIT_IMAGE_BOOLEAN_KEY'),
                false,
                'Unexpected init image boolean value was set'
            )
        })

        it('with image', async function () {
            activationReloadState.setSamInitState({
                template: 'sometemplate',
                readme: 'somepath',
                runtime: 'someruntime',
                isImage: true,
                architecture: 'arm64',
            })

            assert.strictEqual(
                globals.globalState.get('ACTIVATION_LAUNCH_PATH_KEY'),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                globals.globalState.get('ACTIVATION_TEMPLATE_PATH_KEY'),
                'sometemplate',
                'Unexpected Template Path value was set'
            )
            assert.strictEqual(
                globals.globalState.get('SAM_INIT_RUNTIME_KEY'),
                'someruntime',
                'Unexpected init runtime value was set'
            )
            assert.strictEqual(
                globals.globalState.get('SAM_INIT_IMAGE_BOOLEAN_KEY'),
                true,
                'Unexpected init image boolean value was set'
            )
        })
    })

    describe('getSamInitState', async function () {
        it('path defined, without runtime', async function () {
            await globals.globalState.update('ACTIVATION_LAUNCH_PATH_KEY', 'getsomepath')
            await globals.globalState.update('ACTIVATION_TEMPLATE_PATH_KEY', 'gettemplatepath')
            await globals.globalState.update('SAM_INIT_RUNTIME_KEY', undefined)

            assert.strictEqual(
                activationReloadState.getSamInitState()?.readme,
                'getsomepath',
                'Unexpected Launch Path value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.template,
                'gettemplatepath',
                'Unexpected Template Path value was retrieved'
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

        it('path defined, with runtime', async function () {
            await globals.globalState.update('ACTIVATION_LAUNCH_PATH_KEY', 'getsomepath')
            await globals.globalState.update('ACTIVATION_TEMPLATE_PATH_KEY', 'gettemplatepath')
            await globals.globalState.update('SAM_INIT_RUNTIME_KEY', 'getsomeruntime')

            assert.strictEqual(
                activationReloadState.getSamInitState()?.readme,
                'getsomepath',
                'Unexpected Launch Path value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.template,
                'gettemplatepath',
                'Unexpected Template Path value was retrieved'
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

        it('path defined, with runtime and isImage', async function () {
            await globals.globalState.update('ACTIVATION_LAUNCH_PATH_KEY', 'getsomepath')
            await globals.globalState.update('ACTIVATION_TEMPLATE_PATH_KEY', 'gettemplatepath')
            await globals.globalState.update('SAM_INIT_RUNTIME_KEY', 'getsomeruntime')
            await globals.globalState.update('SAM_INIT_IMAGE_BOOLEAN_KEY', true)

            assert.strictEqual(
                activationReloadState.getSamInitState()?.readme,
                'getsomepath',
                'Unexpected Launch Path value was retrieved'
            )
            assert.strictEqual(
                activationReloadState.getSamInitState()?.template,
                'gettemplatepath',
                'Unexpected Template Path value was retrieved'
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
    })

    it('clearLaunchPath', async function () {
        activationReloadState.setSamInitState({
            template: 'sometemplate',
            readme: 'somepath',
            runtime: 'someruntime',
            isImage: true,
            architecture: 'x86_64',
        })
        activationReloadState.clearSamInitState()

        assert.strictEqual(
            globals.globalState.get('ACTIVATION_LAUNCH_PATH_KEY'),
            undefined,
            'Expected launch path to be cleared (undefined)'
        )

        assert.strictEqual(
            globals.globalState.get('ACTIVATION_TEMPLATE_PATH_KEY'),
            undefined,
            'Expected template path to be cleared (undefined)'
        )

        assert.strictEqual(
            globals.globalState.get('SAM_INIT_RUNTIME_KEY'),
            undefined,
            'Expected runtime key to be cleared (undefined)'
        )

        assert.strictEqual(
            globals.globalState.get('SAM_INIT_IMAGE_BOOLEAN_KEY'),
            undefined,
            'Expected isImage key to be cleared (undefined)'
        )
    })
})
