/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { CawsAuthenticationProvider, CawsAuthStorage } from '../../caws/auth'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { Session } from '../../credentials/authentication'

describe('CawsAuthenticationProvider', function () {
    let users: Record<string, { id: string; name: string }>
    let authProvider: CawsAuthenticationProvider

    async function getUser(secret: string): Promise<{ id: string; name: string }> {
        const data = users[secret]
        if (!data) {
            throw new Error('Invalid session')
        }
        return data
    }

    beforeEach(async function () {
        const ctx = await FakeExtensionContext.create()
        authProvider = new CawsAuthenticationProvider(new CawsAuthStorage(ctx.globalState, ctx.secrets), getUser)
        users = {
            cookie: { id: '123', name: 'foo?' },
            'cooooooooookie?': { id: '456', name: 'foo!!!' },
        }
    })

    it('can login', async function () {
        const account = await authProvider.createAccount('cookie')
        assert.strictEqual(account.id, '123')
        assert.strictEqual(account.label, 'foo?')
        assert.strictEqual(authProvider.listAccounts().length, 1)
    })

    it('does not login if the user does not exist', async function () {
        await assert.rejects(authProvider.createAccount('cook-ie'))
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

        const account = await authProvider.createAccount('cookie')
        const session = await authProvider.createSession(account)

        assert.deepStrictEqual(session, await newSession)
    })

    it('can delete a session', async function () {
        const account = await authProvider.createAccount('cookie')
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
        const account = await authProvider.createAccount('cookie')
        delete users['cookie']
        await assert.rejects(authProvider.createSession(account), /Invalid session/)
        await assert.rejects(authProvider.createSession(account), /No secret found/)
    })

    it('can create multiple sessions from multiple accounts', async function () {
        const account1 = await authProvider.createAccount('cookie')
        const account2 = await authProvider.createAccount('cooooooooookie?')

        assert.strictEqual(account1.label, 'foo?')
        assert.strictEqual(account2.label, 'foo!!!')
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
