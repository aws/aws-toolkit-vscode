/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Uri } from 'vscode'
import { SinonSandbox, createSandbox, SinonStubbedInstance } from 'sinon'
import { AuthWebview, buildCommaDelimitedString, emitWebviewClosed } from '../../../../auth/ui/vue/show'
import { assertTelemetry, getProjectDir } from '../../../testUtil'
import { AuthFormId } from '../../../../auth/ui/vue/authForms/types'
import assert from 'assert'
import { fsCommon } from '../../../../srcShared/fs'

describe('emitWebviewClosed()', function () {
    let authWebview: SinonStubbedInstance<AuthWebview>
    let sandbox: SinonSandbox

    beforeEach(function () {
        sandbox = createSandbox()

        authWebview = sandbox.stub(AuthWebview.prototype)
        // stub with defaults
        authWebview.getPreviousFeatureType.returns(undefined)
        authWebview.getPreviousAuthType.returns(undefined)
        authWebview.getAuthsAdded.returns([])
        authWebview.getAuthsInitial.returns(new Set())
        authWebview.getTotalAuthAttempts.returns(0)
        authWebview.getSource.returns('addConnectionQuickPick')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('base case, no connections exist, no user attempts', async function () {
        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Cancelled',
            attempts: 0,
            source: 'addConnectionQuickPick',
        })
    })

    it('existing connections, no user attempts', async function () {
        const auths: AuthFormId[] = ['credentials']
        authWebview.getAuthsInitial.returns(new Set<AuthFormId>(auths))

        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Cancelled',
            attempts: 0,
            authConnectionsCount: 1,
            newAuthConnectionsCount: 0,
            newEnabledAuthConnections: undefined,
            enabledAuthConnections: buildCommaDelimitedString(auths),
        })
    })

    it('user interacted, no connection successfully added', async function () {
        const authsInitial: AuthFormId[] = ['credentials']
        authWebview.getAuthsInitial.returns(new Set<AuthFormId>(authsInitial))
        authWebview.getAuthsAdded.returns([])
        authWebview.getTotalAuthAttempts.returns(20)

        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Failed',
            attempts: 20,
            authConnectionsCount: 1,
            newAuthConnectionsCount: 0,
            newEnabledAuthConnections: undefined,
            enabledAuthConnections: buildCommaDelimitedString(authsInitial),
        })
    })

    it('user interacted, connection successfully added', async function () {
        const authsInitial: Set<AuthFormId> = new Set(['builderIdCodeWhisperer'])
        const authsAdded: AuthFormId[] = ['credentials', 'credentials']
        const authsAll = [...authsInitial, ...authsAdded]
        authWebview.getAuthsInitial.returns(new Set<AuthFormId>(authsInitial))
        authWebview.getAuthsAdded.returns(authsAdded)

        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Succeeded',
            authConnectionsCount: authsInitial.size + authsAdded.length,
            newAuthConnectionsCount: authsAdded.length,
            newEnabledAuthConnections: buildCommaDelimitedString(authsAdded),
            enabledAuthConnections: buildCommaDelimitedString(authsAll),
        })
    })

    it('multiple builder ids added', async function () {
        const authsAdded: AuthFormId[] = ['builderIdCodeCatalyst', 'builderIdCodeWhisperer', 'identityCenterExplorer']
        authWebview.getAuthsAdded.returns(authsAdded)

        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Succeeded',
            authConnectionsCount: authsAdded.length,
            newAuthConnectionsCount: authsAdded.length,
            newEnabledAuthConnections: buildCommaDelimitedString(authsAdded),
            enabledAuthConnections: buildCommaDelimitedString(authsAdded),
        })
    })

    it('multiple credentials added', async function () {
        const authsAdded: AuthFormId[] = ['credentials', 'credentials', 'credentials']
        authWebview.getAuthsAdded.returns(authsAdded)

        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Succeeded',
            authConnectionsCount: authsAdded.length,
            newAuthConnectionsCount: authsAdded.length,
            newEnabledAuthConnections: buildCommaDelimitedString(['credentials']),
            enabledAuthConnections: buildCommaDelimitedString(['credentials']),
        })
    })

    describe('source === "firstTimeUser"', function () {
        beforeEach(function () {
            authWebview.getSource.returns('firstStartup')
        })

        it('no connections exist, no user attempts', async function () {
            await emitWebviewClosed(authWebview)

            assertTelemetry('auth_addedConnections', {
                result: 'Failed',
                source: 'firstStartup',
            })
        })

        it('connections exist, no user attempts', async function () {
            const authsInitial: AuthFormId[] = ['credentials']
            authWebview.getAuthsInitial.returns(new Set<AuthFormId>(authsInitial))

            await emitWebviewClosed(authWebview)

            assertTelemetry('auth_addedConnections', {
                result: 'Succeeded',
                source: 'firstStartup',
                enabledAuthConnections: buildCommaDelimitedString(authsInitial),
                newEnabledAuthConnections: undefined,
            })
        })

        it('no connections exist, only failed attempts', async function () {
            authWebview.getAuthsInitial.returns(new Set())
            authWebview.getAuthsAdded.returns([])

            await emitWebviewClosed(authWebview)

            assertTelemetry('auth_addedConnections', {
                result: 'Failed',
                source: 'firstStartup',
                enabledAuthConnections: undefined,
                newEnabledAuthConnections: undefined,
            })
        })
    })
})

describe('Add Connection webview', function () {
    it('has all images used by the webview', async function () {
        // We are in the root of the built, `dist`, but we want the root of the actual project
        const projectRoot = Uri.joinPath(Uri.file(getProjectDir()), '..', '..')
        const marketplaceImagesRoot = Uri.joinPath(projectRoot, 'docs/marketplace/vscode')

        assert(await fsCommon.fileExists(Uri.joinPath(marketplaceImagesRoot, 'CC_dev_env.gif')))
        assert(await fsCommon.fileExists(Uri.joinPath(marketplaceImagesRoot, 'awsExplorer.gif')))
        assert(await fsCommon.fileExists(Uri.joinPath(marketplaceImagesRoot, 'codewhispererChat.gif')))
    })
})
