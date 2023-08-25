/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import assert from 'assert'
import {
    activationLaunchPathKey,
    ActivationReloadState,
    samInitRuntimeKey,
    samInitImageBooleanKey,
    activationTemplatePathKey,
} from '../../shared/activationReloadState'
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
        await globals.context.globalState.update(activationLaunchPathKey, undefined)
        assert.strictEqual(checkDidReload(globals.context), false)

        await globals.context.globalState.update(activationLaunchPathKey, '/some/path')
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
                globals.context.globalState.get(activationLaunchPathKey),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                globals.context.globalState.get(activationTemplatePathKey),
                'sometemplate',
                'Unexpected Template Path value was set'
            )
            assert.strictEqual(
                globals.context.globalState.get(samInitRuntimeKey),
                undefined,
                'Unexpected init runtime key value was set'
            )
            assert.strictEqual(
                globals.context.globalState.get(samInitImageBooleanKey),
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
                globals.context.globalState.get(activationLaunchPathKey),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                globals.context.globalState.get(activationTemplatePathKey),
                'sometemplate',
                'Unexpected Template Path value was set'
            )
            assert.strictEqual(
                globals.context.globalState.get(samInitRuntimeKey),
                'someruntime',
                'Unexpected init runtime value was set'
            )
            assert.strictEqual(
                globals.context.globalState.get(samInitImageBooleanKey),
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
                globals.context.globalState.get(activationLaunchPathKey),
                'somepath',
                'Unexpected Launch Path value was set'
            )
            assert.strictEqual(
                globals.context.globalState.get(activationTemplatePathKey),
                'sometemplate',
                'Unexpected Template Path value was set'
            )
            assert.strictEqual(
                globals.context.globalState.get(samInitRuntimeKey),
                'someruntime',
                'Unexpected init runtime value was set'
            )
            assert.strictEqual(
                globals.context.globalState.get(samInitImageBooleanKey),
                true,
                'Unexpected init image boolean value was set'
            )
        })
    })

    describe('getSamInitState', async function () {
        it('path defined, without runtime', async function () {
            await globals.context.globalState.update(activationLaunchPathKey, 'getsomepath')
            await globals.context.globalState.update(activationTemplatePathKey, 'gettemplatepath')
            await globals.context.globalState.update(samInitRuntimeKey, undefined)

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
            await globals.context.globalState.update(activationLaunchPathKey, 'getsomepath')
            await globals.context.globalState.update(activationTemplatePathKey, 'gettemplatepath')
            await globals.context.globalState.update(samInitRuntimeKey, 'getsomeruntime')

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
            await globals.context.globalState.update(activationLaunchPathKey, 'getsomepath')
            await globals.context.globalState.update(activationTemplatePathKey, 'gettemplatepath')
            await globals.context.globalState.update(samInitRuntimeKey, 'getsomeruntime')
            await globals.context.globalState.update(samInitImageBooleanKey, true)

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
            globals.context.globalState.get(activationLaunchPathKey),
            undefined,
            'Expected launch path to be cleared (undefined)'
        )

        assert.strictEqual(
            globals.context.globalState.get(activationTemplatePathKey),
            undefined,
            'Expected template path to be cleared (undefined)'
        )

        assert.strictEqual(
            globals.context.globalState.get(samInitRuntimeKey),
            undefined,
            'Expected runtime key to be cleared (undefined)'
        )

        assert.strictEqual(
            globals.context.globalState.get(samInitImageBooleanKey),
            undefined,
            'Expected isImage key to be cleared (undefined)'
        )
    })
})
