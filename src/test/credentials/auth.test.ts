/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { Auth, getSsoProfileKey, ProfileStore, SsoProfile } from '../../credentials/auth'
import { SsoToken } from '../../credentials/sso/model'
import { SsoAccessTokenProvider } from '../../credentials/sso/ssoAccessTokenProvider'
import { FakeMemento } from '../fakeExtensionContext'
import { createTestWindow } from '../shared/vscode/window'
import { captureEvent } from '../testUtil'
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

    function createTestTokenProvider(...[profile]: ConstructorParameters<typeof SsoAccessTokenProvider>) {
        let token: SsoToken | undefined
        const provider = stub(SsoAccessTokenProvider)
        tokenProviders.set(getSsoProfileKey(profile), provider)
        provider.getToken.callsFake(async () => token)
        provider.createToken.callsFake(
            async () => (token = { accessToken: '123', expiresAt: new Date(Date.now() + 1000000) })
        )
        provider.invalidate.callsFake(async () => (token = undefined))

        return provider
    }

    let auth: Auth

    beforeEach(function () {
        tokenProviders.clear()
        sinon.restore()

        const store = new ProfileStore(new FakeMemento())
        auth = new Auth(store, createTestTokenProvider)
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

    it('throws when creating a duplicate connection', async function () {
        await auth.createConnection(ssoProfile)
        await assert.rejects(() => auth.createConnection(ssoProfile))
    })

    it('throws when using an invalid connection that was deleted', async function () {
        const conn = await auth.createConnection(ssoProfile)
        const provider = tokenProviders.get(getSsoProfileKey(ssoProfile))
        await provider?.invalidate()
        await auth.deleteConnection(conn)
        await assert.rejects(() => conn.getToken())
    })

    it('can login and fires an event', async function () {
        const conn = await auth.createConnection(ssoProfile)

        const events = captureEvent(auth.onDidChangeActiveConnection)
        await auth.useConnection(conn)
        assert.strictEqual(auth.activeConnection?.id, conn.id)
        assert.strictEqual(auth.activeConnection.state, 'valid')
        assert.strictEqual(events.emits[0]?.id, conn.id)
    })

    it('can logout and fires an event', async function () {
        const conn = await auth.createConnection(ssoProfile)

        const events = captureEvent(auth.onDidChangeActiveConnection)
        await auth.useConnection(conn)
        assert.strictEqual(auth.activeConnection?.id, conn.id)
        auth.logout()
        assert.strictEqual(auth.activeConnection, undefined)
        assert.strictEqual(events.last, undefined)
    })

    describe('SSO Connections', function () {
        it('creates a new token if one does not exist', async function () {
            const conn = await auth.createConnection(ssoProfile)
            const provider = tokenProviders.get(getSsoProfileKey(ssoProfile))
            assert.deepStrictEqual(await provider?.getToken(), await conn.getToken())
        })

        it('prompts the user if the token is invalid or expired', async function () {
            const conn = await auth.createConnection(ssoProfile)
            const provider = tokenProviders.get(getSsoProfileKey(ssoProfile))
            assert.ok(provider)

            const testWindow = createTestWindow()
            sinon.replace(vscode, 'window', testWindow)

            await conn.getToken()
            await provider.invalidate()
            const token = conn.getToken()
            const message = await testWindow.waitForMessage(/credentials are expired or invalid,/i)
            message.selectItem(/yes/i)
            assert.notStrictEqual(await token, undefined)
        })
    })
})
