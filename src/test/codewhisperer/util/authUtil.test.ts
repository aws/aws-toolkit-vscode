/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { isSsoConnection } from '../../../auth/auth'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'
import { createBuilderIdProfile, createSsoProfile, createTestAuth } from '../../credentials/testUtil'
import { captureEventOnce } from '../../testUtil'
import { codewhispererScopes } from '../../../auth/connection'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'

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

        await authUtil.connectToEnterpriseSso(enterpriseSsoStartUrl, 'us-east-1')
        const conn = authUtil.conn
        assert.strictEqual(conn?.type, 'sso')
        assert.strictEqual(conn.label, 'IAM Identity Center (enterprise)')
    })

    it('should show reauthenticate prompt', async function () {
        getTestWindow().onDidShowMessage(m => {
            if (m.severity === SeverityLevel.Information) {
                m.close()
            }
        })

        await auth.createInvalidSsoConnection(createBuilderIdProfile({ scopes: codewhispererScopes }))
        await authUtil.showReauthenticatePrompt()

        const warningMessage = getTestWindow().shownMessages.filter(m => m.severity == SeverityLevel.Information)
        assert.strictEqual(warningMessage.length, 1)
        assert.strictEqual(
            warningMessage[0].message,
            'Connection expired. To continue using CodeWhisperer, connect with AWS Builder ID or AWS IAM Identity center.'
        )
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

    it('does not prompt to sign out of duplicate builder ID connections', async function () {
        await authUtil.connectToAwsBuilderId()
        await authUtil.connectToAwsBuilderId()
        assert.ok(authUtil.isConnected())

        const ssoConnectionIds = new Set(auth.activeConnectionEvents.emits.filter(isSsoConnection).map(c => c.id))
        assert.strictEqual(ssoConnectionIds.size, 1, 'Expected exactly 1 unique SSO connection id')
        assert.strictEqual((await auth.listConnections()).filter(isSsoConnection).length, 1)
    })

    it('prompts to upgrade connections if they do not have the required scopes', async function () {
        getTestWindow().onDidShowMessage(message => {
            assert.ok(message.modal)
            message.assertMessage(/CodeWhisperer requires access to your/)
            message.selectItem('Proceed')
        })

        const upgradeableConn = await auth.createConnection(createBuilderIdProfile())
        await auth.useConnection(upgradeableConn)
        assert.strictEqual(authUtil.isConnected(), false)

        await authUtil.connectToAwsBuilderId()
        assert.ok(authUtil.isConnected())
        assert.ok(authUtil.isConnectionValid())
        assert.ok(isSsoConnection(authUtil.conn))
        assert.strictEqual(authUtil.conn?.id, upgradeableConn.id)
        assert.strictEqual(authUtil.conn.startUrl, upgradeableConn.startUrl)
        assert.strictEqual(authUtil.conn.ssoRegion, upgradeableConn.ssoRegion)
        assert.strictEqual((await auth.listConnections()).filter(isSsoConnection).length, 1)
    })
})
