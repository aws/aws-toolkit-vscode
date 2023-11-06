/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AuthUtil, defaultCwScopes } from '../../../codewhisperer/util/authUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'
import { createBuilderIdProfile, createSsoProfile, createTestAuth } from '../../credentials/testUtil'
import { captureEventOnce } from '../../testUtil'
import { codewhispererScopes, isAnySsoConnection, isBuilderIdConnection } from '../../../auth/connection'

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
        assert.deepStrictEqual(cwConn.scopes, [randomScope, ...defaultCwScopes])
    })

    it('should show reauthenticate prompt', async function () {
        getTestWindow().onDidShowMessage(m => {
            if (m.severity === SeverityLevel.Information) {
                m.close()
            }
        })

        await auth.createInvalidSsoConnection(createBuilderIdProfile({ scopes: codewhispererScopes }))
        await authUtil.showReauthenticatePrompt()

        const warningMessage = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Information)
        assert.strictEqual(warningMessage.length, 1)
        assert.strictEqual(
            warningMessage[0].message,
            'Connection expired. To continue using CodeWhisperer, connect with AWS Builder ID or AWS IAM Identity center.'
        )
    })

    it('CodeWhisperer uses fallback connection when switching to an unsupported connection', async function () {
        const supportedConn = await auth.createConnection(createBuilderIdProfile({ scopes: codewhispererScopes }))
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
