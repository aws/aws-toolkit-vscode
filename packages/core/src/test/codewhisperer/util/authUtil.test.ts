/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    AuthStates,
    AuthUtil,
    amazonQScopes,
    codeWhispererChatScopes,
    codeWhispererCoreScopes,
} from '../../../codewhisperer/util/authUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'
import { createBuilderIdProfile, createSsoProfile, createTestAuth } from '../../credentials/testUtil'
import { captureEventOnce } from '../../testUtil'
import { Connection, isAnySsoConnection, isBuilderIdConnection } from '../../../auth/connection'
import { Auth } from '../../../auth/auth'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'

describe('AuthUtil', async function () {
    let auth: ReturnType<typeof createTestAuth>
    let authUtil: AuthUtil

    beforeEach(async function () {
        auth = createTestAuth()
        authUtil = new AuthUtil(auth)
    })

    afterEach(async function () {
        await auth.logout()
    })

    it('if there is no valid AwsBuilderID conn, it will create one and use it', async function () {
        getTestWindow().onDidShowQuickPick(async picker => {
            await picker.untilReady()
            picker.acceptItem(picker.items[1])
        })

        await authUtil.connectToAwsBuilderId()
        const conn = authUtil.conn
        assert.strictEqual(conn?.type, 'sso')
        assert.strictEqual(conn.label, 'AWS Builder ID')
        assert.deepStrictEqual(conn.scopes, codeWhispererChatScopes)
    })

    it('if there IS an existing AwsBuilderID conn, it will upgrade the scopes and use it', async function () {
        const existingBuilderId = await auth.createConnection(
            createBuilderIdProfile({ scopes: codeWhispererCoreScopes })
        )
        getTestWindow().onDidShowQuickPick(async picker => {
            await picker.untilReady()
            picker.acceptItem(picker.items[1])
        })

        await authUtil.connectToAwsBuilderId()

        const conn = authUtil.conn
        assert.strictEqual(conn?.type, 'sso')
        assert.strictEqual(conn.id, existingBuilderId.id)
        assert.deepStrictEqual(conn.scopes, codeWhispererChatScopes)
    })

    it('if there is no valid enterprise SSO conn, will create and use one', async function () {
        getTestWindow().onDidShowQuickPick(async picker => {
            await picker.untilReady()
            picker.acceptItem(picker.items[1])
        })

        await authUtil.connectToEnterpriseSso(enterpriseSsoStartUrl, 'us-east-1')
        const conn = authUtil.conn
        assert.strictEqual(conn?.type, 'sso')
        assert.strictEqual(conn.label, 'IAM Identity Center (enterprise)')
    })

    it('should add scopes + connect to existing IAM Identity Center connection', async function () {
        getTestWindow().onDidShowMessage(async message => {
            assert.ok(message.modal)
            message.selectItem('Proceed')
        })
        const randomScope = 'my:random:scope'
        const ssoConn = await auth.createInvalidSsoConnection(
            createSsoProfile({ startUrl: enterpriseSsoStartUrl, scopes: [randomScope] })
        )

        // Method under test
        await authUtil.connectToEnterpriseSso(ssoConn.startUrl, 'us-east-1')

        const cwConn = authUtil.conn
        assert.strictEqual(cwConn?.type, 'sso')
        assert.strictEqual(cwConn.label, 'IAM Identity Center (enterprise)')
        assert.deepStrictEqual(cwConn.scopes, [randomScope, ...amazonQScopes])
    })

    it('reauthenticates an existing BUT invalid Amazon Q IAM Identity Center connection', async function () {
        const ssoConn = await auth.createInvalidSsoConnection(
            createSsoProfile({ startUrl: enterpriseSsoStartUrl, scopes: amazonQScopes })
        )
        await auth.refreshConnectionState(ssoConn)
        assert.strictEqual(auth.getConnectionState(ssoConn), 'invalid')

        // Method under test
        await authUtil.connectToEnterpriseSso(ssoConn.startUrl, 'us-east-1')

        const cwConn = authUtil.conn
        assert.strictEqual(cwConn?.type, 'sso')
        assert.strictEqual(cwConn.id, ssoConn.id)
        assert.deepStrictEqual(cwConn.scopes, amazonQScopes)
        assert.strictEqual(auth.getConnectionState(cwConn), 'valid')
    })

    it('should show reauthenticate prompt', async function () {
        getTestWindow().onDidShowMessage(m => {
            if (m.severity === SeverityLevel.Information) {
                m.close()
            }
        })

        await authUtil.showReauthenticatePrompt()

        const warningMessage = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Information)
        assert.strictEqual(warningMessage.length, 1)
        assert.strictEqual(warningMessage[0].message, `Your Amazon Q connection has expired. Please re-authenticate.`)
    })

    it('reauthenticate prompt reauthenticates invalid connection', async function () {
        const conn = await auth.createInvalidSsoConnection(
            createSsoProfile({ startUrl: enterpriseSsoStartUrl, scopes: codeWhispererChatScopes })
        )
        await auth.useConnection(conn)
        getTestWindow().onDidShowMessage(m => {
            m.selectItem('Connect with AWS')
        })
        assert.strictEqual(auth.getConnectionState(conn), 'invalid')

        await authUtil.showReauthenticatePrompt()

        assert.strictEqual(authUtil.conn?.type, 'sso')
        assert.strictEqual(auth.getConnectionState(conn), 'valid')
    })

    it('reauthenticate does NOT add missing CodeWhisperer scopes if not required to', async function () {
        const conn = await auth.createConnection(createBuilderIdProfile({ scopes: codeWhispererCoreScopes }))
        await auth.useConnection(conn)

        await authUtil.reauthenticate()

        assert.strictEqual(authUtil.conn?.type, 'sso')
        assert.deepStrictEqual(authUtil.conn?.scopes, codeWhispererCoreScopes)
    })

    it('reauthenticate adds missing CodeWhisperer Chat Builder ID scopes when explicitly required', async function () {
        const conn = await auth.createConnection(createBuilderIdProfile({ scopes: codeWhispererCoreScopes }))
        await auth.useConnection(conn)

        // method under test
        await authUtil.reauthenticate(true)

        assert.strictEqual(authUtil.conn?.type, 'sso')
        assert.deepStrictEqual(authUtil.conn?.scopes, codeWhispererChatScopes)
    })

    it('reauthenticate adds missing Amazon Q IdC scopes when explicitly required', async function () {
        const conn = await auth.createConnection(
            createSsoProfile({ startUrl: enterpriseSsoStartUrl, scopes: codeWhispererCoreScopes })
        )
        await auth.useConnection(conn)

        // method under test
        await authUtil.reauthenticate(true)

        assert.strictEqual(authUtil.conn?.type, 'sso')
        assert.deepStrictEqual(authUtil.conn?.scopes, amazonQScopes)
    })

    it('CodeWhisperer uses fallback connection when switching to an unsupported connection', async function () {
        const supportedConn = await auth.createConnection(createBuilderIdProfile({ scopes: codeWhispererChatScopes }))
        const unsupportedConn = await auth.createConnection(createSsoProfile())

        await auth.useConnection(supportedConn)
        assert.ok(authUtil.isConnected())
        assert.strictEqual(auth.activeConnection?.id, authUtil.conn?.id)

        // Switch to unsupported connection
        const cwAuthUpdatedConnection = captureEventOnce(authUtil.secondaryAuth.onDidChangeActiveConnection)
        await auth.useConnection(unsupportedConn)
        await cwAuthUpdatedConnection

        // Is using the fallback connection
        assert.ok(authUtil.isConnected())
        assert.ok(authUtil.isUsingSavedConnection)
        assert.notStrictEqual(auth.activeConnection?.id, authUtil.conn?.id)
        assert.strictEqual(authUtil.conn?.type, 'sso')
        assert.deepStrictEqual(authUtil.conn?.scopes, codeWhispererChatScopes)
    })

    it('does not prompt to sign out of duplicate builder ID connections', async function () {
        await authUtil.connectToAwsBuilderId()
        await authUtil.connectToAwsBuilderId()
        assert.ok(authUtil.isConnected())

        const ssoConnectionIds = new Set(auth.activeConnectionEvents.emits.filter(isAnySsoConnection).map(c => c.id))
        assert.strictEqual(ssoConnectionIds.size, 1, 'Expected exactly 1 unique SSO connection id')
        assert.strictEqual((await auth.listConnections()).filter(isAnySsoConnection).length, 1)
    })

    it('automatically upgrades connections if they do not have the required scopes', async function () {
        const upgradeableConn = await auth.createConnection(createBuilderIdProfile())
        await auth.useConnection(upgradeableConn)
        assert.strictEqual(authUtil.isConnected(), false)

        await authUtil.connectToAwsBuilderId()
        assert.ok(authUtil.isConnected())
        assert.ok(authUtil.isConnectionValid())
        assert.ok(isBuilderIdConnection(authUtil.conn))
        assert.strictEqual(authUtil.conn?.id, upgradeableConn.id)
        assert.strictEqual(authUtil.conn.startUrl, upgradeableConn.startUrl)
        assert.strictEqual(authUtil.conn.ssoRegion, upgradeableConn.ssoRegion)
        assert.deepStrictEqual(authUtil.conn.scopes, codeWhispererChatScopes)
        assert.strictEqual((await auth.listConnections()).filter(isAnySsoConnection).length, 1)
    })

    it('test reformatStartUrl should remove trailing slash and hash', function () {
        const expected = 'https://view.awsapps.com/start'
        assert.strictEqual(authUtil.reformatStartUrl(expected + '/'), expected)
        assert.strictEqual(authUtil.reformatStartUrl(undefined), undefined)
        assert.strictEqual(authUtil.reformatStartUrl(expected + '/#'), expected)
        assert.strictEqual(authUtil.reformatStartUrl(expected + '#/'), expected)
        assert.strictEqual(authUtil.reformatStartUrl(expected + '/#/'), expected)
        assert.strictEqual(authUtil.reformatStartUrl(expected + '####'), expected)
    })
})

describe('getChatAuthState()', function () {
    let auth: ReturnType<typeof createTestAuth>
    let authUtil: AuthUtil
    let laterDate: Date

    beforeEach(async function () {
        auth = createTestAuth()
        authUtil = new AuthUtil(auth)

        laterDate = new Date(Date.now() + 10_000_000)
    })

    afterEach(async function () {
        await auth.logout()
    })

    it('indicates nothing connected when no auth connection exists', async function () {
        const result = await authUtil.getChatAuthState()
        assert.deepStrictEqual(result, {
            codewhispererChat: AuthStates.disconnected,
            codewhispererCore: AuthStates.disconnected,
            amazonQ: AuthStates.disconnected,
        })
    })

    /** Affects {@link Auth.refreshConnectionState} */
    function createToken(conn: Connection) {
        auth.getTestTokenProvider(conn).getToken.resolves({ accessToken: 'myAccessToken', expiresAt: laterDate })
    }

    describe('Builder ID', function () {
        it('indicates only CodeWhisperer core is connected when only CW core scopes are set', async function () {
            const conn = await auth.createConnection(createBuilderIdProfile({ scopes: codeWhispererCoreScopes }))
            createToken(conn)
            await auth.useConnection(conn)

            const result = await authUtil.getChatAuthState()
            assert.deepStrictEqual(result, {
                codewhispererCore: AuthStates.connected,
                codewhispererChat: AuthStates.expired,
                amazonQ: AuthStates.unsupported,
            })
        })

        it('indicates all SUPPORTED features connected when all scopes are set', async function () {
            const conn = await auth.createConnection(createBuilderIdProfile({ scopes: codeWhispererChatScopes }))
            createToken(conn)
            await auth.useConnection(conn)

            const result = await authUtil.getChatAuthState()
            assert.deepStrictEqual(result, {
                codewhispererCore: AuthStates.connected,
                codewhispererChat: AuthStates.connected,
                amazonQ: AuthStates.unsupported,
            })
        })

        it('indicates all SUPPORTED features expired when connection is invalid', async function () {
            const conn = await auth.createInvalidSsoConnection(
                createBuilderIdProfile({ scopes: codeWhispererChatScopes })
            )
            await auth.useConnection(conn)

            const result = await authUtil.getChatAuthState()
            assert.deepStrictEqual(result, {
                codewhispererCore: AuthStates.expired,
                codewhispererChat: AuthStates.expired,
                amazonQ: AuthStates.unsupported,
            })
        })
    })

    describe('Identity Center', function () {
        it('indicates only CW core is connected when only CW core scopes are set', async function () {
            const conn = await auth.createConnection(
                createSsoProfile({ startUrl: enterpriseSsoStartUrl, scopes: codeWhispererCoreScopes })
            )
            createToken(conn)
            await auth.useConnection(conn)

            const result = await authUtil.getChatAuthState()
            assert.deepStrictEqual(result, {
                codewhispererCore: AuthStates.connected,
                codewhispererChat: AuthStates.expired,
                amazonQ: AuthStates.expired,
            })
        })

        it('indicates all features connected when all scopes are set', async function () {
            const conn = await auth.createConnection(
                createSsoProfile({ startUrl: enterpriseSsoStartUrl, scopes: amazonQScopes })
            )
            createToken(conn)
            await auth.useConnection(conn)

            const result = await authUtil.getChatAuthState()
            assert.deepStrictEqual(result, {
                codewhispererCore: AuthStates.connected,
                codewhispererChat: AuthStates.connected,
                amazonQ: AuthStates.connected,
            })
        })

        it('indicates all features expired when connection is invalid', async function () {
            const conn = await auth.createInvalidSsoConnection(
                createSsoProfile({ startUrl: enterpriseSsoStartUrl, scopes: amazonQScopes })
            )
            await auth.useConnection(conn)

            const result = await authUtil.getChatAuthState()
            assert.deepStrictEqual(result, {
                codewhispererCore: AuthStates.expired,
                codewhispererChat: AuthStates.expired,
                amazonQ: AuthStates.expired,
            })
        })
    })
})
