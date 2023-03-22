/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SsoProfile, codewhispererScopes, isSsoConnection } from '../../../credentials/auth'
import { AuthUtil, isUpgradeableConnection } from '../../../codewhisperer/util/authUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'
import { createBuilderIdProfile, createSsoProfile, createTestAuth } from '../../credentials/testUtil'
import { captureEventOnce } from '../../testUtil'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'

function createEntSsoProfile(props?: Partial<Omit<SsoProfile, 'type' | 'startUrl'>>): SsoProfile {
    return createSsoProfile({ startUrl: enterpriseSsoStartUrl, ...props })
}

describe('AuthUtil', async function () {
    let auth: ReturnType<typeof createTestAuth>
    let authUtil: AuthUtil

    beforeEach(async function () {
        auth = createTestAuth()
        authUtil = new AuthUtil(auth)
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

        await authUtil.connectToEnterpriseSso(enterpriseSsoStartUrl)
        const conn = authUtil.conn
        assert.strictEqual(conn?.type, 'sso')
        assert.strictEqual(conn.label, 'IAM Identity Center (enterprise)')
    })

    it('can correctly identify upgradeable and non-upgradable SSO connections', async function () {
        const ssoProfile = createSsoProfile()
        const awsBuilderIdProfile = createBuilderIdProfile({ scopes: codewhispererScopes })
        const enterpriseSsoProfile = createEntSsoProfile({ scopes: codewhispererScopes })

        const builderIdConn = await auth.createConnection(awsBuilderIdProfile)
        const ssoConn = await auth.createConnection(ssoProfile)
        const entSsoConn = await auth.createConnection(enterpriseSsoProfile)

        assert.ok(isUpgradeableConnection(ssoConn))
        assert.ok(!isUpgradeableConnection(builderIdConn))
        assert.ok(!isUpgradeableConnection(entSsoConn))
    })

    it('should show reauthenticate prompt', async function () {
        getTestWindow().onDidShowMessage(m => {
            if (m.severity === SeverityLevel.Warning) {
                m.selectItem('Cancel')
            }
        })

        await auth.createInvalidSsoConnection(createBuilderIdProfile({ scopes: codewhispererScopes }))
        await authUtil.showReauthenticatePrompt()

        const warningMessage = getTestWindow().shownMessages.filter(m => m.severity == SeverityLevel.Warning)
        assert.strictEqual(warningMessage.length, 1)
        assert.strictEqual(warningMessage[0].message, 'AWS Toolkit: Connection expired. Reauthenticate to continue.')
    })

    it('prompts to attach connection to CodeWhisperer when switching to an unsupported connection', async function () {
        const supportedConn = await auth.createConnection(createBuilderIdProfile({ scopes: codewhispererScopes }))
        const unsupportedConn = await auth.createConnection(createSsoProfile())

        getTestWindow().onDidShowQuickPick(picker => {
            assert.ok(picker.title?.startsWith(`Some tools you've been using don't work with ${unsupportedConn.label}`))
            const keepUsing = picker.findItemOrThrow(new RegExp(`keep using ${supportedConn.label}`))
            picker.acceptItem(keepUsing)
        })

        await auth.useConnection(supportedConn)
        assert.ok(authUtil.isConnected())
        assert.strictEqual(auth.activeConnection?.id, authUtil.conn?.id)

        await auth.useConnection(unsupportedConn)
        await captureEventOnce(authUtil.secondaryAuth.onDidChangeActiveConnection)
        assert.ok(authUtil.isConnected())
        assert.ok(authUtil.isUsingSavedConnection)
        assert.notStrictEqual(auth.activeConnection?.id, authUtil.conn?.id)
    })

    it('prompts to sign out of duplicate builder ID connections', async function () {
        getTestWindow().onDidShowQuickPick(picker => {
            const signout = picker.findItemOrThrow(/Sign out to add another\?/i)
            picker.acceptItem(signout)
        })

        await authUtil.connectToAwsBuilderId()
        await authUtil.connectToAwsBuilderId()
        assert.ok(authUtil.isConnected())

        const ssoConnectionIds = new Set(auth.activeConnectionEvents.emits.filter(isSsoConnection).map(c => c.id))
        assert.strictEqual(ssoConnectionIds.size, 2, 'Expected exactly 2 unique SSO connection IDs, one for each call')
        assert.strictEqual((await auth.listConnections()).filter(isSsoConnection).length, 1)
    })

    it('prompts to upgrade connections if they do not have the required scopes', async function () {
        getTestWindow().onDidShowMessage(message => {
            assert.ok(message.modal)
            message.assertMessage(/The current connection lacks permissions required by CodeWhisperer/)
            message.selectItem('Yes')
        })

        const upgradeableConn = await auth.createConnection(createBuilderIdProfile())
        await auth.useConnection(upgradeableConn)
        assert.strictEqual(authUtil.isConnected(), false)

        await authUtil.tryUpgradeActiveConnection()
        assert.ok(authUtil.isConnected())
        assert.ok(authUtil.isConnectionValid())
        assert.strictEqual(authUtil.conn?.id, upgradeableConn.id)
        assert.strictEqual(authUtil.conn.startUrl, upgradeableConn.startUrl)
        assert.strictEqual(authUtil.conn.ssoRegion, upgradeableConn.ssoRegion)
        assert.strictEqual((await auth.listConnections()).filter(isSsoConnection).length, 1)
    })
})
