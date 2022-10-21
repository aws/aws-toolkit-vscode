/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { CodeCatalystAuthenticationProvider, CodeCatalystAuthStorage } from '../../codecatalyst/auth'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { UserDetails } from '../../shared/clients/codeCatalystClient'
import { SsoAccessTokenProvider } from '../../credentials/sso/ssoAccessTokenProvider'
import { SsoToken } from '../../credentials/sso/model'

describe('CodeCatalystAuthenticationProvider', function () {
    const savedUsers = new Map<string, UserDetails | undefined>()
    let users: typeof savedUsers
    let secrets: string[]
    let authProvider: CodeCatalystAuthenticationProvider

    async function getUser(secret: () => Promise<string>, id?: string | UserDetails): Promise<UserDetails> {
        const data = users.get(await secret())

        if (!data) {
            throw new Error('Invalid session')
        }

        return data
    }

    function makeUser(id: string, name: string): string {
        const secret = `secret-${savedUsers.size + 1}`
        const person = {
            version: '1',
            userId: id,
            userName: name,
            displayName: name,
            primaryEmail: { email: `${name}@foo.com`, verified: false },
        } as const

        savedUsers.set(secret, person)

        return secret
    }

    const secret1 = makeUser('123', 'myusername')
    makeUser('456', 'anothername')
    const secret2 = makeUser('123', 'myusername')

    before(function () {
        // XXX: we call into UI flows in this service. Need to stub until we can do better dependency management.
        function getToken(id?: string): SsoToken | undefined {
            if (!id) {
                const accessToken = secrets.shift()
                return accessToken ? { accessToken, expiresAt: new Date(9999999999999) } : undefined
            }

            const entries = Array.from(users.entries())
            const accessToken = entries.find(([_, person]) => person?.userId === id)?.[0]
            if (accessToken) {
                return { accessToken, expiresAt: new Date(9999999999999) }
            }
        }

        sinon
            .stub(SsoAccessTokenProvider.prototype, 'getToken')
            .callsFake(async function (this: SsoAccessTokenProvider) {
                return getToken(this.tokenCacheKey)
            })
        sinon.stub(SsoAccessTokenProvider.prototype, 'createToken').callsFake(async callback => {
            const token = getToken()
            assert.ok(token)
            return { ...token, identity: await callback?.(token) }
        })
    })

    after(function () {
        sinon.restore()
    })

    beforeEach(async function () {
        const ctx = await FakeExtensionContext.create()
        // TODO: initialize secrets/memento directly instead of stubbing `SsoAccessTokenProvider`
        authProvider = new CodeCatalystAuthenticationProvider(
            new CodeCatalystAuthStorage(ctx.globalState, ctx.secrets),
            getUser
        )
        users = new Map(savedUsers.entries())
        secrets = Array.from(users.keys())
    })

    it('can login', async function () {
        const account = await authProvider.createAccount()
        assert.strictEqual(account.id, '123')
        assert.strictEqual(account.label, 'myusername')
        assert.strictEqual(authProvider.listAccounts().length, 1)
    })

    it('does not login if the user does not exist', async function () {
        users.set(secret1, undefined)
        await assert.rejects(authProvider.createAccount())
        assert.strictEqual(authProvider.listAccounts().length, 0)
    })

    it('can create a session', async function () {
        const account = await authProvider.createAccount()
        const session = await authProvider.login(account)

        assert.deepStrictEqual(authProvider.activeAccount, account)
        assert.deepStrictEqual(session.accountDetails, account)
    })

    it('fires an event when logging out', async function () {
        const account = await authProvider.createAccount()
        await authProvider.login(account)

        const removedSession = new Promise<void>((resolve, reject) => {
            authProvider.onDidChangeSession(e => {
                e === undefined ? resolve() : reject(new Error('Expected session to be removed'))
            })
        })

        await authProvider.logout()
        assert.strictEqual(authProvider.activeAccount, undefined)
        assert.strictEqual(await removedSession, undefined)
    })

    it('evicts stored secrets on failure', async function () {
        const account = await authProvider.createAccount()
        users.set(secret1, undefined)
        users.set(secret2, undefined)
        await assert.rejects(authProvider.login(account), /credentials are invalid/i)
    })

    it('can switch accounts', async function () {
        const account1 = await authProvider.createAccount()
        const account2 = await authProvider.createAccount()

        assert.strictEqual(account1.label, 'myusername')
        assert.strictEqual(account2.label, 'anothername')
        assert.strictEqual(authProvider.listAccounts().length, 2)

        const session1 = await authProvider.login(account1)
        const session2 = await authProvider.login(account2)

        assert.notStrictEqual(session1.id, session2.id)
        assert.deepStrictEqual(authProvider.activeAccount, session2.accountDetails)
    })

    it('does not fire an event when refreshing', async function () {
        sinon.restore()
        sinon
            .stub(SsoAccessTokenProvider.prototype, 'getToken')
            .onFirstCall()
            .resolves({ expiresAt: new Date(0), accessToken: secret1, identity: '123' })
            .onSecondCall()
            .resolves({ expiresAt: new Date(999999999999), accessToken: secret2, identity: '123' })
        sinon.stub(SsoAccessTokenProvider.prototype, 'createToken').callsFake(async callback => {
            const token = { expiresAt: new Date(0), accessToken: secret1 }
            return { ...token, identity: await callback?.(token) }
        })

        const account = await authProvider.createAccount()
        const session1 = await authProvider.login(account)

        let eventCounter = 0
        authProvider.onDidChangeSession(() => (eventCounter += 1))
        const session2 = await authProvider.getSession()

        assert.ok(session2)
        assert.notStrictEqual(session1.accessDetails, session2.accessDetails)
        assert.strictEqual(eventCounter, 0)
    })
})
