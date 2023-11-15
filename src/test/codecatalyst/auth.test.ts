/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { CodeCatalystAuthStorage, CodeCatalystAuthenticationProvider, defaultScopes } from '../../codecatalyst/auth'
import { getTestWindow } from '../shared/vscode/window'
import { FakeMemento, FakeSecretStorage } from '../fakeExtensionContext'
import { createBuilderIdProfile, createSsoProfile, createTestAuth } from '../credentials/testUtil'
import Sinon from 'sinon'
import { isAnySsoConnection } from '../../auth/connection'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'

describe('CodeCatalystAuthenticationProvider', async function () {
    let auth: ReturnType<typeof createTestAuth>
    let codecatalystAuth: CodeCatalystAuthenticationProvider

    beforeEach(async function () {
        auth = createTestAuth()
        codecatalystAuth = new CodeCatalystAuthenticationProvider(
            new CodeCatalystAuthStorage(new FakeSecretStorage()),
            new FakeMemento(),
            auth
        )
    })

    afterEach(async function () {
        await auth.logout()
    })

    describe('connectToAwsBuilderId()', () => {
        it('should create a new connection', async function () {
            Sinon.stub(codecatalystAuth, 'isConnectionOnboarded').resolves(true)

            getTestWindow().onDidShowQuickPick(async picker => {
                await picker.untilReady()
                picker.acceptItem(picker.items[1])
            })

            await codecatalystAuth.connectToAwsBuilderId()
            const conn = codecatalystAuth.activeConnection
            assert.strictEqual(conn?.type, 'sso')
            assert.strictEqual(conn.label, 'AWS Builder ID')
        })

        it('should add scopes to existing Builder ID connection', async function () {
            Sinon.stub(codecatalystAuth, 'isConnectionOnboarded').resolves(true)

            getTestWindow().onDidShowMessage(async message => {
                assert.ok(message.modal)
                message.selectItem('Proceed')
            })
            const otherScope = 'my:other:scope'
            const ssoConn = await auth.createInvalidSsoConnection(createBuilderIdProfile({ scopes: [otherScope] }))

            // Method under test
            await codecatalystAuth.connectToEnterpriseSso(ssoConn.startUrl, 'us-east-1')

            const conn = codecatalystAuth.activeConnection
            assert.strictEqual(conn?.type, 'sso')
            assert.strictEqual(conn.label, 'AWS Builder ID')
            assert.deepStrictEqual(conn.scopes, [otherScope, ...defaultScopes])
        })

        it('does not prompt to sign out of duplicate builder ID connections', async function () {
            Sinon.stub(codecatalystAuth, 'isConnectionOnboarded').resolves(true)

            await codecatalystAuth.connectToAwsBuilderId()
            await codecatalystAuth.connectToAwsBuilderId()
            assert.ok(codecatalystAuth.isConnected())

            const ssoConnectionIds = new Set(
                auth.activeConnectionEvents.emits.filter(isAnySsoConnection).map(c => c.id)
            )
            assert.strictEqual(ssoConnectionIds.size, 1, 'Expected exactly 1 unique SSO connection id')
            assert.strictEqual((await auth.listConnections()).filter(isAnySsoConnection).length, 1)
        })
    })

    describe('connectToEnterpriseSso()', () => {
        it('should create a new connection', async function () {
            Sinon.stub(codecatalystAuth, 'isConnectionOnboarded').resolves(true)

            getTestWindow().onDidShowQuickPick(async picker => {
                await picker.untilReady()
                picker.acceptItem(picker.items[1])
            })

            await codecatalystAuth.connectToEnterpriseSso(enterpriseSsoStartUrl, 'us-east-1')
            const conn = codecatalystAuth.activeConnection
            assert.strictEqual(conn?.type, 'sso')
            assert.strictEqual(conn.label, 'IAM Identity Center (enterprise)')
        })

        it('should add scopes to existing IAM Identity Center connection', async function () {
            Sinon.stub(codecatalystAuth, 'isConnectionOnboarded').resolves(true)

            getTestWindow().onDidShowMessage(async message => {
                assert.ok(message.modal)
                message.selectItem('Proceed')
            })
            const otherScope = 'my:other:scope'
            const ssoConn = await auth.createInvalidSsoConnection(
                createSsoProfile({ startUrl: enterpriseSsoStartUrl, scopes: [otherScope] })
            )

            // Method under test
            await codecatalystAuth.connectToEnterpriseSso(ssoConn.startUrl, 'us-east-1')

            const conn = codecatalystAuth.activeConnection
            assert.strictEqual(conn?.type, 'sso')
            assert.strictEqual(conn.label, 'IAM Identity Center (enterprise)')
            assert.deepStrictEqual(conn.scopes, [otherScope, ...defaultScopes])
        })
    })
})
