/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SinonSandbox, createSandbox, SinonStubbedInstance } from 'sinon'
import { AuthWebview, builderCommaDelimitedString, emitWebviewClosed } from '../../../../auth/ui/vue/show'
import { assertTelemetry } from '../../../testUtil'
import { AuthFormId } from '../../../../auth/ui/vue/authForms/types'

describe('emitWebviewClosed() final emitted metric', function () {
    let authWebview: SinonStubbedInstance<AuthWebview>
    let sandbox: SinonSandbox

    beforeEach(function () {
        sandbox = createSandbox()

        authWebview = sandbox.stub(AuthWebview.prototype)
        // stub with defaults
        authWebview.getPreviousFeatureType.returns(undefined)
        authWebview.getPreviousAuthType.returns(undefined)
        authWebview.getNumConnectionsInitial.returns(0)
        authWebview.getNumConnectionsAdded.returns(0)
        authWebview.getAuthsAdded.returns(new Set())
        authWebview.getAuthsInitial.returns(new Set())
        authWebview.getTotalAuthAttempts.returns(0)
        authWebview.getSource.returns('firstStartup')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('base case, no connections exist, no user interactions', async function () {
        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Cancelled',
            attempts: 0,
            source: 'unknown',
        })
    })

    it('existing connections, no user interactions', async function () {
        const auths: AuthFormId[] = ['credentials']
        authWebview.getNumConnectionsInitial.returns(1)
        authWebview.getNumConnectionsAdded.returns(0)
        authWebview.getAuthsInitial.returns(new Set<AuthFormId>(auths))
        authWebview.getAuthsAdded.returns(new Set())

        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Cancelled',
            attempts: 0,
            authConnectionsCount: 1,
            newAuthConnectionsCount: 0,
            newEnabledAuthConnections: undefined,
            enabledAuthConnections: builderCommaDelimitedString(auths),
        })
    })

    it('user interacted, no connection successfully added', async function () {
        const initialAuths: AuthFormId[] = ['credentials']
        authWebview.getNumConnectionsInitial.returns(initialAuths.length)
        authWebview.getAuthsInitial.returns(new Set<AuthFormId>(initialAuths))
        authWebview.getAuthsAdded.returns(new Set())
        authWebview.getTotalAuthAttempts.returns(20)

        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Failed',
            attempts: 20,
            authConnectionsCount: 1,
            newAuthConnectionsCount: 0,
            newEnabledAuthConnections: undefined,
            enabledAuthConnections: builderCommaDelimitedString(initialAuths),
        })
    })

    it('user interacted, connection successfully added', async function () {
        const initialNumConnections = 10
        const addedNumConnections = 2

        const initialAuths: AuthFormId[] = ['credentials']
        const addedAuths: AuthFormId[] = ['builderIdCodeWhisperer']
        const allAuths = [...initialAuths, ...addedAuths]
        authWebview.getNumConnectionsInitial.returns(initialNumConnections)
        authWebview.getNumConnectionsAdded.returns(addedNumConnections)
        authWebview.getAuthsInitial.returns(new Set<AuthFormId>(initialAuths))
        authWebview.getAuthsAdded.returns(new Set(addedAuths))
        authWebview.getTotalAuthAttempts.returns(20) // arbitrary

        await emitWebviewClosed(authWebview)

        assertTelemetry('auth_addedConnections', {
            result: 'Succeeded',
            attempts: 20,
            authConnectionsCount: initialNumConnections + addedNumConnections,
            newAuthConnectionsCount: addedNumConnections,
            newEnabledAuthConnections: builderCommaDelimitedString(addedAuths),
            enabledAuthConnections: builderCommaDelimitedString(allAuths),
        })
    })

    describe('firstTimeUser', function () {
        beforeEach(function () {
            authWebview.getSource.returns('firstStartup')
        })

        it('no connections exist, no user interactions', async function () {
            await emitWebviewClosed(authWebview)

            assertTelemetry('auth_addedConnections', {
                result: 'Failed',
                attempts: 0,
            })
        })
    })
})
