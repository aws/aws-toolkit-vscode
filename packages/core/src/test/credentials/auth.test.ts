/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { ToolkitError, isUserCancelledError } from '../../shared/errors'
import { assertTreeItem } from '../shared/treeview/testUtil'
import { getTestWindow } from '../shared/vscode/window'
import { captureEventOnce } from '../testUtil'
import { createBuilderIdProfile, createSsoProfile, createTestAuth } from './testUtil'
import { toCollection } from '../../shared/utilities/asyncCollection'
import globals from '../../shared/extensionGlobals'
import { SystemUtilities } from '../../shared/systemUtilities'
import { makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { SharedCredentialsProviderFactory } from '../../auth/providers/sharedCredentialsProviderFactory'
import { UserCredentialsUtils } from '../../shared/credentials/userCredentialsUtils'
import { getCredentialsFilename } from '../../auth/credentials/sharedCredentialsFile'
import { Connection, isIamConnection, isSsoConnection, scopesSsoAccountAccess } from '../../auth/connection'
import { AuthNode, createDeleteConnectionButton, promptForConnection } from '../../auth/utils'

const ssoProfile = createSsoProfile()
const scopedSsoProfile = createSsoProfile({ scopes: ['foo'] })

describe('Auth', function () {
    let auth: ReturnType<typeof createTestAuth>

    beforeEach(function () {
        auth = createTestAuth()
    })

    it('can create a new sso connection', async function () {
        const conn = await auth.createConnection(ssoProfile)
        assert.strictEqual(conn.type, 'sso')
    })

    it('can list connections', async function () {
        const conn1 = await auth.createConnection(ssoProfile)
        const conn2 = await auth.createConnection(scopedSsoProfile)
        assert.deepStrictEqual(
            (await auth.listConnections()).map(c => c.id),
            [conn1.id, conn2.id]
        )
    })

    it('can get a connection', async function () {
        const conn = await auth.createConnection(ssoProfile)
        assert.ok(await auth.getConnection({ id: conn.id }))
    })

    it('can delete a connection', async function () {
        const conn = await auth.createConnection(ssoProfile)
        await auth.deleteConnection({ id: conn.id })
        assert.strictEqual((await auth.listConnections()).length, 0)
    })

    it('can delete an active connection', async function () {
        const conn = await auth.createConnection(ssoProfile)
        await auth.useConnection(conn)
        assert.ok(auth.activeConnection)
        await auth.deleteConnection(auth.activeConnection)
        assert.strictEqual((await auth.listConnections()).length, 0)
        assert.strictEqual(auth.activeConnection, undefined)
    })

    it('does not throw when creating a duplicate connection', async function () {
        const initialConn = await auth.createConnection(ssoProfile)
        const duplicateConn = await auth.createConnection(ssoProfile)
        assert.notStrictEqual(initialConn.id, duplicateConn.id)
    })

    it('throws when using an invalid connection that was deleted', async function () {
        const conn = await auth.createInvalidSsoConnection(ssoProfile)
        await auth.deleteConnection(conn)
        await assert.rejects(() => conn.getToken())
    })

    it('can logout and fires an event', async function () {
        const conn = await auth.createConnection(ssoProfile)
        await auth.useConnection(conn)
        assert.strictEqual(auth.activeConnection?.id, conn.id)
        await auth.logout()
        assert.strictEqual(auth.activeConnection, undefined)
        assert.strictEqual(auth.activeConnectionEvents.last, undefined)
    })

    describe('useConnection', function () {
        it('does not reauthenticate if the connection is invalid', async function () {
            const conn = await auth.createInvalidSsoConnection(ssoProfile)
            await auth.useConnection(conn)
            assert.strictEqual(auth.activeConnection?.state, 'invalid')
        })

        it('fires an event', async function () {
            const conn = await auth.createConnection(ssoProfile)
            await auth.useConnection(conn)
            assert.strictEqual(auth.activeConnectionEvents.emits[0]?.id, conn.id)
        })

        it('sets the active connection even when the underlying provider throws', async function () {
            const err = new Error('test')
            const conn = await auth.createConnection(ssoProfile)
            auth.getTestTokenProvider(conn)?.getToken.rejects(err)
            await auth.useConnection(conn)
            assert.strictEqual(auth.activeConnection?.id, conn.id)
            assert.strictEqual(auth.getInvalidationReason(conn), err)
        })
    })

    it('can login and fires an event', async function () {
        const conn = await auth.createConnection(ssoProfile)
        await auth.useConnection(conn)
        assert.strictEqual(auth.activeConnection?.id, conn.id)
        assert.strictEqual(auth.activeConnection.state, 'valid')
        assert.strictEqual(auth.activeConnectionEvents.emits[0]?.id, conn.id)
    })

    it('uses the persisted connection if available (valid)', async function () {
        const conn = await auth.createConnection(ssoProfile)
        await auth.profileStore.setCurrentProfileId(conn.id)
        await auth.restorePreviousSession()
        assert.strictEqual(auth.activeConnection?.state, 'valid')
    })

    it('uses the persisted connection if available (invalid)', async function () {
        const conn = await auth.createInvalidSsoConnection(ssoProfile)
        auth.getTestTokenProvider(conn).getToken.resolves(undefined)
        await auth.profileStore.setCurrentProfileId(conn.id)
        await auth.restorePreviousSession()
        assert.strictEqual(auth.activeConnection?.state, 'invalid')
    })

    it('prevents concurrent `reauthenticate` operations on the same connection', async function () {
        const conn = await auth.createInvalidSsoConnection(ssoProfile)
        await Promise.all([auth.reauthenticate(conn), auth.reauthenticate(conn)])
        const t1 = await conn.getToken()
        assert.strictEqual(t1.accessToken, '2', 'Only two tokens should have been created')
        const t3 = await auth.reauthenticate(conn).then(c => c.getToken())
        assert.notStrictEqual(t1.accessToken, t3.accessToken, 'Access tokens should change after `reauthenticate`')
    })

    describe('updateConnection', function () {
        const updatedProfile = createSsoProfile({
            ...ssoProfile,
            scopes: [...(ssoProfile.scopes ?? []), 'my:scope'],
        })

        it('keeps the same connection id after updating', async function () {
            const conn = await auth.createConnection(ssoProfile)
            const updated = await auth.updateConnection(conn, updatedProfile)

            assert.strictEqual(conn.id, updated.id)
            assert.deepStrictEqual(updated.scopes, updatedProfile.scopes)
        })

        it('invalidates the connection', async function () {
            const conn = await auth.createConnection(ssoProfile)
            const updated = await auth.updateConnection(conn, updatedProfile)

            assert.strictEqual(auth.getConnectionState(updated), 'invalid')
        })

        it('fires an event when updating', async function () {
            const conn = await auth.createConnection(ssoProfile)
            await auth.updateConnection(conn, updatedProfile)

            assert.strictEqual(auth.updateConnectionEvents.emits.length, 1)
            assert.ok(isSsoConnection(auth.updateConnectionEvents.last))
            assert.deepStrictEqual(auth.updateConnectionEvents.last.scopes, updatedProfile.scopes)
        })

        it('fires an event when updating the active connection', async function () {
            const conn = await auth.createConnection(ssoProfile)
            await auth.useConnection(conn)
            await auth.updateConnection(conn, updatedProfile)

            assert.ok(isSsoConnection(auth.activeConnectionEvents.last))
            assert.deepStrictEqual(auth.activeConnectionEvents.last.scopes, updatedProfile.scopes)
        })
    })

    const expiredConnPattern = /connection ".*?" is invalid or expired/i
    it('releases all notification locks after reauthenticating', async function () {
        const conn = await auth.createInvalidSsoConnection(ssoProfile)
        const pendingToken = conn.getToken()
        await getTestWindow().waitForMessage(expiredConnPattern)
        await auth.reauthenticate(conn)
        await assert.rejects(pendingToken)
        assert.ok(await conn.getToken())
    })

    async function runExpiredConnectionFlow(conn: Connection, selection: string | RegExp) {
        const creds = conn.type === 'sso' ? conn.getToken() : conn.getCredentials()
        const message = await getTestWindow().waitForMessage(expiredConnPattern)
        message.selectItem(selection)

        return creds
    }

    describe('SSO Connections', function () {
        it('creates a new token if one does not exist', async function () {
            const conn = await auth.createConnection(ssoProfile)
            const provider = auth.getTestTokenProvider(conn)
            assert.deepStrictEqual(await provider.getToken(), await conn.getToken())
        })

        it('prompts the user if the token is invalid or expired', async function () {
            const conn = await auth.createInvalidSsoConnection(ssoProfile)
            const token = await runExpiredConnectionFlow(conn, /login/i)
            assert.notStrictEqual(token, undefined)
        })

        it('using the connection lazily updates the state', async function () {
            const conn = await auth.createConnection(ssoProfile)
            await auth.useConnection(conn)
            await auth.invalidateCachedCredentials(conn)

            const token = runExpiredConnectionFlow(conn, /no/i)
            await assert.rejects(token, ToolkitError)

            assert.strictEqual(auth.activeConnection?.state, 'invalid')
        })

        it('chains errors when handling invalid connections', async function () {
            const err1 = new ToolkitError('test', { code: 'test' })
            const conn = await auth.createConnection(ssoProfile)
            auth.getTestTokenProvider(conn)?.getToken.rejects(err1)
            const err2 = await runExpiredConnectionFlow(conn, /no/i).catch(e => e)
            assert.ok(err2 instanceof ToolkitError)
            assert.strictEqual(err2.cause, err1)
        })

        it('bubbles up networking issues instead of invalidating the connection', async function () {
            const expected = new ToolkitError('test', { code: 'ETIMEDOUT' })
            const conn = await auth.createConnection(ssoProfile)
            auth.getTestTokenProvider(conn)?.getToken.rejects(expected)
            const actual = await conn.getToken().catch(e => e)
            assert.ok(actual instanceof ToolkitError)
            assert.strictEqual(actual.cause, expected)
            assert.strictEqual(auth.getConnectionState(conn), 'valid')
        })

        it('connection is not invalidated when networking issue during connection refresh', async function () {
            const networkError = new ToolkitError('test', { code: 'ETIMEDOUT' })
            const expectedError = new ToolkitError('Failed to update connection due to networking issues', {
                cause: networkError,
            })
            const conn = await auth.createConnection(ssoProfile)
            auth.getTestTokenProvider(conn)?.getToken.rejects(networkError)
            const actual = await auth.refreshConnectionState(conn).catch(e => e)
            assert.ok(actual instanceof ToolkitError)
            assert.deepStrictEqual(actual, expectedError)
            assert.strictEqual(auth.getConnectionState(conn), 'valid')
        })
    })

    describe('Linked Connections', function () {
        const linkedSsoProfile = createSsoProfile({ scopes: scopesSsoAccountAccess })
        const accountRoles = [
            { accountId: '1245678910', roleName: 'foo' },
            { accountId: '9876543210', roleName: 'foo' },
            { accountId: '9876543210', roleName: 'bar' },
        ]

        beforeEach(function () {
            auth.ssoClient.listAccounts.returns(
                toCollection(async function* () {
                    yield [{ accountId: '1245678910' }, { accountId: '9876543210' }]
                })
            )

            auth.ssoClient.listAccountRoles.callsFake(req =>
                toCollection(async function* () {
                    yield accountRoles.filter(i => i.accountId === req.accountId)
                })
            )

            auth.ssoClient.getRoleCredentials.resolves({
                accessKeyId: 'xxx',
                secretAccessKey: 'xxx',
                expiration: new Date(Date.now() + 1000000),
            })

            sinon.stub(globals.loginManager, 'validateCredentials').resolves('')
        })

        afterEach(function () {
            sinon.restore()
        })

        it('lists linked conections for SSO connections', async function () {
            await auth.createConnection(linkedSsoProfile)
            const connections = await auth.listAndTraverseConnections().promise()
            assert.deepStrictEqual(
                connections.map(c => c.type),
                ['sso', 'iam', 'iam', 'iam']
            )
        })

        it('shows a user message if SSO connection returned no accounts/roles', async function () {
            auth.ssoClient.listAccounts.returns(
                toCollection(async function* () {
                    yield []
                })
            )
            await auth.createConnection(linkedSsoProfile)
            await auth.listAndTraverseConnections().promise()
            assert.strictEqual(
                getTestWindow().shownMessages[0].message,
                'IAM Identity Center (d-0123456789) returned no roles. Ensure the user is assigned to an account with a Permission Set.'
            )
        })

        it('does not gather linked accounts when calling `listConnections`', async function () {
            await auth.createConnection(linkedSsoProfile)
            const connections = await auth.listConnections()
            assert.deepStrictEqual(
                connections.map(c => c.type),
                ['sso']
            )
        })

        it('caches linked conections when the source connection becomes invalid', async function () {
            const conn = await auth.createConnection(linkedSsoProfile)
            await auth.listAndTraverseConnections().promise()
            await auth.invalidateCachedCredentials(conn)

            const connections = await auth.listConnections()
            assert.deepStrictEqual(
                connections.map(c => c.type),
                ['sso', 'iam', 'iam', 'iam']
            )
        })

        it('gracefully handles source connections becoming invalid when discovering linked accounts', async function () {
            await auth.createConnection(linkedSsoProfile)
            auth.ssoClient.listAccounts.rejects(new Error('No access'))
            const connections = await auth.listAndTraverseConnections().promise()
            assert.deepStrictEqual(
                connections.map(c => c.type),
                ['sso']
            )
        })

        it('removes linked connections when the source connection is deleted', async function () {
            const conn = await auth.createConnection(linkedSsoProfile)
            await auth.listAndTraverseConnections().promise()
            await auth.deleteConnection(conn)

            assert.deepStrictEqual(await auth.listAndTraverseConnections().promise(), [])
        })

        it('prompts the user to reauthenticate if the source connection becomes invalid', async function () {
            const source = await auth.createConnection(linkedSsoProfile)
            const conn = await auth.listAndTraverseConnections().find(c => isIamConnection(c) && c.id.includes('sso'))
            assert.ok(conn)
            await auth.useConnection(conn)
            await auth.reauthenticate(conn)
            await auth.invalidateCachedCredentials(conn)
            await auth.invalidateCachedCredentials(source)

            await runExpiredConnectionFlow(conn, /login/i)
            assert.strictEqual(auth.getConnectionState(source), 'valid')
            assert.strictEqual(auth.getConnectionState(conn), 'valid')
        })

        describe('Multiple Connections', function () {
            const otherProfile = createBuilderIdProfile({ scopes: scopesSsoAccountAccess })

            // Equivalent profiles from multiple sources is a fairly rare situation right now
            // Ideally they would be de-duped although the implementation can be tricky
            it('can handle multiple SSO connection and does not de-dupe', async function () {
                await auth.createConnection(linkedSsoProfile)
                await auth.createConnection(otherProfile)

                const connections = await auth.listAndTraverseConnections().promise()
                assert.deepStrictEqual(
                    connections.map(c => c.type),
                    ['sso', 'sso', 'iam', 'iam', 'iam', 'iam', 'iam', 'iam'],
                    'Expected two SSO connections and 3 IAM connections for each SSO connection'
                )
            })

            it('does not stop discovery if one connection fails', async function () {
                const otherProfile = createBuilderIdProfile({ scopes: scopesSsoAccountAccess })
                await auth.createConnection(linkedSsoProfile)
                await auth.createConnection(otherProfile)
                auth.ssoClient.listAccounts.onFirstCall().rejects(new Error('No access'))
                const connections = await auth.listAndTraverseConnections().promise()
                assert.deepStrictEqual(
                    connections.map(c => c.type),
                    ['sso', 'sso', 'iam', 'iam', 'iam']
                )
            })
        })
    })

    describe('Shared ini files', function () {
        let tmpDir: string

        beforeEach(async function () {
            tmpDir = await makeTemporaryToolkitFolder()
            sinon.stub(SystemUtilities, 'getHomeDirectory').returns(tmpDir)
            sinon.stub(globals.loginManager, 'validateCredentials').resolves('123')
            auth.credentialsManager.addProviderFactory(new SharedCredentialsProviderFactory())
        })

        afterEach(async function () {
            sinon.restore()
            await SystemUtilities.delete(tmpDir, { recursive: true })
        })

        it('does not cache if the credentials file changes', async function () {
            const initialCreds = {
                profileName: 'default',
                accessKey: 'x',
                secretKey: 'x',
            }

            await UserCredentialsUtils.generateCredentialsFile(initialCreds)

            const conn = await auth.getConnection({ id: 'profile:default' })
            assert.ok(conn?.type === 'iam', 'Expected an IAM connection')
            assert.deepStrictEqual(await conn.getCredentials(), {
                accessKeyId: initialCreds.accessKey,
                secretAccessKey: initialCreds.secretKey,
                sessionToken: undefined,
            })

            await SystemUtilities.delete(getCredentialsFilename())

            const newCreds = { ...initialCreds, accessKey: 'y', secretKey: 'y' }
            await UserCredentialsUtils.generateCredentialsFile(newCreds)
            assert.deepStrictEqual(await conn.getCredentials(), {
                accessKeyId: newCreds.accessKey,
                secretAccessKey: newCreds.secretKey,
                sessionToken: undefined,
            })
        })
    })

    describe('AuthNode', function () {
        it('shows a message to create a connection if no connections exist', async function () {
            const node = new AuthNode(auth)
            await assertTreeItem(node, { label: 'Connect to AWS to Get Started...' })
        })

        it('shows a login message if not connected', async function () {
            await auth.createConnection(ssoProfile)
            const node = new AuthNode(auth)
            await assertTreeItem(node, { label: 'Select a connection...' })
        })

        it('shows the connection if valid', async function () {
            const node = new AuthNode(auth)
            const conn = await auth.createConnection(ssoProfile)
            await auth.useConnection(conn)
            await assertTreeItem(node, { label: `Connected with ${conn.label}` })
        })

        it('shows an error if the connection is invalid', async function () {
            const node = new AuthNode(auth)
            const conn = await auth.createInvalidSsoConnection(ssoProfile)
            auth.getTestTokenProvider(conn).getToken.resolves(undefined)
            await auth.useConnection(conn)
            await assertTreeItem(node, { description: 'expired or invalid, click to authenticate' })
        })
    })

    describe('promptForConnection', function () {
        it('shows a list of connections', async function () {
            getTestWindow().onDidShowQuickPick(async picker => {
                await picker.untilReady()
                const connItem = picker.findItemOrThrow(/IAM Identity Center/)
                picker.acceptItem(connItem)
            })

            const conn = await auth.createConnection(ssoProfile)
            assert.strictEqual((await promptForConnection(auth))?.id, conn.id)
        })

        it('refreshes when clicking the refresh button', async function () {
            getTestWindow().onDidShowQuickPick(async picker => {
                await picker.untilReady()
                await auth.reauthenticate(conn)
                picker.pressButton('Refresh')
                await picker.untilReady()
                picker.acceptItem(/IAM Identity Center/)
            })

            const conn = await auth.createInvalidSsoConnection(ssoProfile)
            await auth.useConnection(conn)
            assert.strictEqual((await promptForConnection(auth))?.id, conn.id)
        })

        it('reauthenticates a connection if the user selects an expired one', async function () {
            getTestWindow().onDidShowQuickPick(async picker => {
                await picker.untilReady()
                const connItem = picker.findItemOrThrow(/IAM Identity Center/)
                assert.ok(connItem.description?.match(/expired/i))
                picker.acceptItem(connItem)
                await captureEventOnce(picker.onDidChangeSelection)
                const refreshedConnItem = picker.findItemOrThrow(/IAM Identity Center/)
                assert.ok(!refreshedConnItem.description?.match(/expired/i))
                picker.acceptItem(refreshedConnItem)
            })

            const conn = await auth.createInvalidSsoConnection(ssoProfile)
            await auth.useConnection(conn)
            assert.strictEqual((await promptForConnection(auth))?.id, conn.id)
            assert.strictEqual(getTestWindow().shownQuickPicks.length, 1, 'Two pickers should not be shown')
        })

        it('deletes a connection', async function () {
            const deleteButton = createDeleteConnectionButton()
            getTestWindow().onDidShowQuickPick(async picker => {
                await picker.untilReady()
                assert.strictEqual(picker.items.length, 3)

                // Delete first connection
                picker.pressItemButton(/IAM Identity Center/, deleteButton)
                await picker.untilReady()
                assert.strictEqual(picker.items.length, 2)

                // Delete second connection
                picker.pressItemButton(/IAM Identity Center/, deleteButton)
                await picker.untilReady()
                assert.strictEqual(picker.items.length, 1)

                picker.pressButton('Exit')
            })

            // Add 2 connections
            await auth.createConnection(ssoProfile)
            await auth.createConnection(scopedSsoProfile)
            assert.strictEqual((await auth.listConnections()).length, 2)

            await assert.rejects(() => promptForConnection(auth), isUserCancelledError)
            assert.strictEqual((await auth.listConnections()).length, 0)
        })
    })
})
