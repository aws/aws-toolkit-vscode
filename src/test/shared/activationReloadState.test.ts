/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import {
    ACTIVATION_LAUNCH_PATH_KEY,
    ActivationReloadState,
    SAM_INIT_RUNTIME_KEY,
    SAM_INIT_IMAGE_BOOLEAN_KEY,
    ACTIVATION_TEMPLATE_PATH_KEY,
} from '../../shared/activationReloadState'
import { ext } from '../../shared/extensionGlobals'

describe('ActivationReloadState', async function () {
    const activationReloadState = new ActivationReloadState()

    beforeEach(function () {
        activationReloadState.clearSamInitState()
    })

    afterEach(function () {
        activationReloadState.clearSamInitState()
    })

    it('decides ext.didReload()', async function () {
        await ext.context.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, undefined)
        // Force ext to re-initialize.
        ext.init(ext.context, ext.window)
        assert.strictEqual(ext.didReload(), false)

        await ext.context.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, '/some/path')
        // Force ext to re-initialize.
        ext.init(ext.context, ext.window)
        assert.strictEqual(ext.didReload(), true)
    })

    describe('setSamInitState', async function () {
        it('without runtime', async function () {
            activationReloadState.setSamInitState({
                template: 'sometemplate',
                readme: 'somepath',
                runtime: undefined,
                isImage: false,
            })

            assert.strictEqual(
                ext.context.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                ext.context.globalState.get(ACTIVATION_TEMPLATE_PATH_KEY),
                'sometemplate',
                'Unexpected Template Path value was set'
            )
            assert.strictEqual(
                ext.context.globalState.get(SAM_INIT_RUNTIME_KEY),
                undefined,
                'Unexpected init runtime key value was set'
            )
            assert.strictEqual(
                ext.context.globalState.get(SAM_INIT_IMAGE_BOOLEAN_KEY),
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
            })

            assert.strictEqual(
                ext.context.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                ext.context.globalState.get(ACTIVATION_TEMPLATE_PATH_KEY),
                'sometemplate',
                'Unexpected Template Path value was set'
            )
            assert.strictEqual(
                ext.context.globalState.get(SAM_INIT_RUNTIME_KEY),
                'someruntime',
                'Unexpected init runtime value was set'
            )
            assert.strictEqual(
                ext.context.globalState.get(SAM_INIT_IMAGE_BOOLEAN_KEY),
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
            })

            assert.strictEqual(
                ext.context.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                ext.context.globalState.get(ACTIVATION_TEMPLATE_PATH_KEY),
                'sometemplate',
                'Unexpected Template Path value was set'
            )
            assert.strictEqual(
                ext.context.globalState.get(SAM_INIT_RUNTIME_KEY),
                'someruntime',
                'Unexpected init runtime value was set'
            )
            assert.strictEqual(
                ext.context.globalState.get(SAM_INIT_IMAGE_BOOLEAN_KEY),
                true,
                'Unexpected init image boolean value was set'
            )
        })
    })

    describe('getSamInitState', async function () {
        it('path defined, without runtime', async function () {
            await ext.context.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, 'getsomepath')
            await ext.context.globalState.update(ACTIVATION_TEMPLATE_PATH_KEY, 'gettemplatepath')
            await ext.context.globalState.update(SAM_INIT_RUNTIME_KEY, undefined)

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
            await ext.context.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, 'getsomepath')
            await ext.context.globalState.update(ACTIVATION_TEMPLATE_PATH_KEY, 'gettemplatepath')
            await ext.context.globalState.update(SAM_INIT_RUNTIME_KEY, 'getsomeruntime')

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
            await ext.context.globalState.update(ACTIVATION_LAUNCH_PATH_KEY, 'getsomepath')
            await ext.context.globalState.update(ACTIVATION_TEMPLATE_PATH_KEY, 'gettemplatepath')
            await ext.context.globalState.update(SAM_INIT_RUNTIME_KEY, 'getsomeruntime')
            await ext.context.globalState.update(SAM_INIT_IMAGE_BOOLEAN_KEY, true)

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
        })
        activationReloadState.clearSamInitState()

        assert.strictEqual(
            ext.context.globalState.get(ACTIVATION_LAUNCH_PATH_KEY),
            undefined,
            'Expected launch path to be cleared (undefined)'
        )

        assert.strictEqual(
            ext.context.globalState.get(ACTIVATION_TEMPLATE_PATH_KEY),
            undefined,
            'Expected template path to be cleared (undefined)'
        )

        assert.strictEqual(
            ext.context.globalState.get(SAM_INIT_RUNTIME_KEY),
            undefined,
            'Expected runtime key to be cleared (undefined)'
        )

        assert.strictEqual(
            ext.context.globalState.get(SAM_INIT_IMAGE_BOOLEAN_KEY),
            undefined,
            'Expected isImage key to be cleared (undefined)'
        )
    })
})
