/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    Auth,
    AuthNode,
    getSsoProfileKey,
    ProfileStore,
    promptForConnection,
    SsoConnection,
    SsoProfile,
} from '../../credentials/auth'
import { CredentialsProviderManager } from '../../credentials/providers/credentialsProviderManager'
import { SsoClient } from '../../credentials/sso/clients'
import { SsoToken } from '../../credentials/sso/model'
import { SsoAccessTokenProvider } from '../../credentials/sso/ssoAccessTokenProvider'
import { ToolkitError } from '../../shared/errors'
import { FakeMemento } from '../fakeExtensionContext'
import { assertTreeItem } from '../shared/treeview/testUtil'
import { getTestWindow } from '../shared/vscode/window'
import { captureEvent, captureEventOnce } from '../testUtil'
import { stub } from '../utilities/stubber'

function createSsoProfile(props?: Partial<Omit<SsoProfile, 'type'>>): SsoProfile {
    return {
        type: 'sso',
        ssoRegion: 'us-east-1',
        startUrl: 'https://d-0123456789.awsapps.com/start',
        ...props,
    }
}

const ssoProfile = createSsoProfile()
const scopedSsoProfile = createSsoProfile({ scopes: ['foo'] })

describe('Auth', function () {
    const tokenProviders = new Map<string, ReturnType<typeof createTestTokenProvider>>()

    function createTestTokenProvider() {
        let token: SsoToken | undefined
        let counter = 0
        const provider = stub(SsoAccessTokenProvider)
        provider.getToken.callsFake(async () => token)
        provider.createToken.callsFake(
            async () => (token = { accessToken: String(++counter), expiresAt: new Date(Date.now() + 1000000) })
        )
        provider.invalidate.callsFake(async () => (token = undefined))

        return provider
    }

    function getTestTokenProvider(...[profile]: ConstructorParameters<typeof SsoAccessTokenProvider>) {
        const key = getSsoProfileKey(profile)
        const cachedProvider = tokenProviders.get(key)
        if (cachedProvider !== undefined) {
            return cachedProvider
        }

        const provider = createTestTokenProvider()
        tokenProviders.set(key, provider)

        return provider
    }

    async function invalidateConnection(profile: SsoProfile) {
        const provider = tokenProviders.get(getSsoProfileKey(profile))
        await provider?.invalidate()

        return provider
    }

    async function setupInvalidSsoConnection(auth: Auth, profile: SsoProfile) {
        const conn = await auth.createConnection(profile)
        await invalidateConnection(profile)

        return conn
    }

    let auth: Auth
    let store: ProfileStore

    afterEach(function () {
        tokenProviders.clear()
        sinon.restore()
    })

    beforeEach(function () {
        store = new ProfileStore(new FakeMemento())
        auth = new Auth(store, getTestTokenProvider, new CredentialsProviderManager())

        sinon.replace(SsoClient, 'create', () => {
            const s = stub(SsoClient)
            s.logout.resolves()

            return s
        })
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
        const initialConn = await auth.createConnection({ ...ssoProfile, scopes: ['a'] })
        const duplicateConn = await auth.createConnection({ ...ssoProfile, scopes: ['b'] })
        assert.deepStrictEqual(initialConn.scopes, ['a'])
        assert.deepStrictEqual(duplicateConn.scopes, ['a', 'b'])
    })

    it('throws when using an invalid connection that was deleted', async function () {
        const conn = await setupInvalidSsoConnection(auth, ssoProfile)
        await auth.deleteConnection(conn)
        await assert.rejects(() => conn.getToken())
    })

    it('can logout and fires an event', async function () {
        const conn = await auth.createConnection(ssoProfile)
        const events = captureEvent(auth.onDidChangeActiveConnection)
        await auth.useConnection(conn)
        assert.strictEqual(auth.activeConnection?.id, conn.id)
        await auth.logout()
        assert.strictEqual(auth.activeConnection, undefined)
        assert.strictEqual(events.last, undefined)
    })

    describe('useConnection', function () {
        it('does not reauthenticate if the connection is invalid', async function () {
            const conn = await setupInvalidSsoConnection(auth, ssoProfile)
            await auth.useConnection(conn)
            assert.strictEqual(auth.activeConnection?.state, 'invalid')
        })

        it('fires an event', async function () {
            const conn = await auth.createConnection(ssoProfile)
            const events = captureEvent(auth.onDidChangeActiveConnection)
            await auth.useConnection(conn)
            assert.strictEqual(events.emits[0]?.id, conn.id)
        })
    })

    it('can login and fires an event', async function () {
        const conn = await auth.createConnection(ssoProfile)
        const events = captureEvent(auth.onDidChangeActiveConnection)
        await auth.useConnection(conn)
        assert.strictEqual(auth.activeConnection?.id, conn.id)
        assert.strictEqual(auth.activeConnection.state, 'valid')
        assert.strictEqual(events.emits[0]?.id, conn.id)
    })

    it('uses the persisted connection if available (valid)', async function () {
        const conn = await auth.createConnection(ssoProfile)
        await store.setCurrentProfileId(conn.id)
        await auth.restorePreviousSession()
        assert.strictEqual(auth.activeConnection?.state, 'valid')
    })

    it('uses the persisted connection if available (invalid)', async function () {
        const conn = await setupInvalidSsoConnection(auth, ssoProfile)
        tokenProviders.get(getSsoProfileKey(ssoProfile))?.getToken.resolves(undefined)
        await store.setCurrentProfileId(conn.id)
        await auth.restorePreviousSession()
        assert.strictEqual(auth.activeConnection?.state, 'invalid')
    })

    it('prevents concurrent `reauthenticate` operations on the same connection', async function () {
        const conn = await setupInvalidSsoConnection(auth, ssoProfile)
        await Promise.all([auth.reauthenticate(conn), auth.reauthenticate(conn)])
        const t1 = await conn.getToken()
        assert.strictEqual(t1.accessToken, '2', 'Only two tokens should have been created')
        const t3 = await auth.reauthenticate(conn).then(c => c.getToken())
        assert.notStrictEqual(t1.accessToken, t3.accessToken, 'Access tokens should change after `reauthenticate`')
    })

    describe('SSO Connections', function () {
        async function runExpiredGetTokenFlow(conn: SsoConnection, selection: string | RegExp) {
            const token = conn.getToken()
            const message = await getTestWindow().waitForMessage(/connection is invalid or expired/i)
            message.selectItem(selection)

            return token
        }

        it('creates a new token if one does not exist', async function () {
            const conn = await auth.createConnection(ssoProfile)
            const provider = tokenProviders.get(getSsoProfileKey(ssoProfile))
            assert.deepStrictEqual(await provider?.getToken(), await conn.getToken())
        })

        it('prompts the user if the token is invalid or expired', async function () {
            const conn = await setupInvalidSsoConnection(auth, ssoProfile)
            const token = await runExpiredGetTokenFlow(conn, /yes/i)
            assert.notStrictEqual(token, undefined)
        })

        it('using the connection lazily updates the state', async function () {
            const conn = await auth.createConnection(ssoProfile)
            await auth.useConnection(conn)
            await invalidateConnection(ssoProfile)

            const token = runExpiredGetTokenFlow(conn, /no/i)
            await assert.rejects(token, ToolkitError)

            assert.strictEqual(auth.activeConnection?.state, 'invalid')
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
            const conn = await setupInvalidSsoConnection(auth, ssoProfile)
            tokenProviders.get(getSsoProfileKey(ssoProfile))?.getToken.resolves(undefined)
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

            const conn = await setupInvalidSsoConnection(auth, ssoProfile)
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

            const conn = await setupInvalidSsoConnection(auth, ssoProfile)
            await auth.useConnection(conn)
            assert.strictEqual((await promptForConnection(auth))?.id, conn.id)
            assert.strictEqual(getTestWindow().shownQuickPicks.length, 1, 'Two pickers should not be shown')
        })
    })
})
