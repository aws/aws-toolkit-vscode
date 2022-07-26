/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { CawsAuthenticationProvider, CawsAuthStorage } from '../../caws/auth'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { Session } from '../../credentials/authentication'
import { UserDetails } from '../../shared/clients/cawsClient'
import { SsoAccessTokenProvider } from '../../credentials/sso/ssoAccessTokenProvider'
import { SsoToken } from '../../credentials/sso/model'

describe('CawsAuthenticationProvider', function () {
    const savedUsers = new Map<string, UserDetails | undefined>()
    let users: typeof savedUsers
    let secrets: string[]
    let authProvider: CawsAuthenticationProvider

    async function getUser(secret: string, id?: string | UserDetails): Promise<UserDetails> {
        const data = users.get(secret)

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
        authProvider = new CawsAuthenticationProvider(new CawsAuthStorage(ctx.globalState, ctx.secrets), getUser)
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
        const newSession = new Promise<Session>((resolve, reject) => {
            authProvider.onDidChangeSessions(e => {
                if (e.added && e.added[0]) {
                    resolve(e.added[0])
                } else {
                    reject(new Error('Expected session to be added'))
                }
            })
        })

        const account = await authProvider.createAccount()
        const session = await authProvider.createSession(account)

        assert.deepStrictEqual(session, await newSession)
    })

    it('can delete a session', async function () {
        const account = await authProvider.createAccount()
        const session = await authProvider.createSession(account)

        assert.strictEqual(authProvider.listSessions().length, 1)

        const removedSession = new Promise<Session>((resolve, reject) => {
            authProvider.onDidChangeSessions(e => {
                if (e.removed && e.removed[0]) {
                    resolve(e.removed[0])
                } else {
                    reject(new Error('Expected session to be removed'))
                }
            })
        })

        await authProvider.deleteSession(session)
        assert.strictEqual(authProvider.listSessions().length, 0)
        assert.deepStrictEqual(session, await removedSession)
    })

    it('evicts stored secrets on failure', async function () {
        const account = await authProvider.createAccount()
        users.set(secret1, undefined)
        await assert.rejects(authProvider.createSession(account), /no access token/)
    })

    it('can create multiple sessions from multiple accounts', async function () {
        const account1 = await authProvider.createAccount()
        const account2 = await authProvider.createAccount()

        assert.strictEqual(account1.label, 'myusername')
        assert.strictEqual(account2.label, 'anothername')
        assert.strictEqual(authProvider.listAccounts().length, 2)

        const session1 = await authProvider.createSession(account1)
        const session2 = await authProvider.createSession(account2)
        const session3 = await authProvider.createSession(account2)

        assert.notStrictEqual(session1.id, session2.id)
        assert.notStrictEqual(session1.id, session3.id)
        assert.notStrictEqual(session2.id, session3.id)
        assert.deepStrictEqual(session1.accountDetails, account1)
        assert.deepStrictEqual(session2.accountDetails, account2)
        assert.deepStrictEqual(session3.accountDetails, account2)
        assert.strictEqual(authProvider.listSessions().length, 3)
    })
})
