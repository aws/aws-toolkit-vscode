/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SinonSandbox, SinonStub, createSandbox } from 'sinon'
import { SecondaryAuth, getSecondaryAuth } from '../../auth/secondaryAuth'
import { createBuilderIdProfile, createTestAuth } from './testUtil'
import { Connection, createSsoProfile, hasScopes, isSsoConnection } from '../../auth/connection'
import assert from 'assert'
import globals from '../../shared/extensionGlobals'
import { waitUntil } from '../../shared/utilities/timeoutUtils'

describe('SecondaryAuth', function () {
    let auth: ReturnType<typeof createTestAuth>
    let secondaryAuth: SecondaryAuth
    let isValid: (conn: Connection) => conn is Connection
    let sandbox: SinonSandbox
    let conn: Connection
    const scopes = ['test:scope']

    let onDidChangeActiveConnection: SinonStub

    beforeEach(async function () {
        auth = createTestAuth(globals.globalState)
        sandbox = createSandbox()
        conn = await auth.createConnection(createBuilderIdProfile({ scopes: scopes }))
        isValid = (conn: Connection): conn is Connection => {
            return isSsoConnection(conn) && hasScopes(conn, scopes)
        }
        // await globals.globalState.clear()
        secondaryAuth = getSecondaryAuth(auth, 'codecatalyst', 'testLabel', isValid)
        onDidChangeActiveConnection = sandbox.stub()
        secondaryAuth.onDidChangeActiveConnection(onDidChangeActiveConnection)
    })

    afterEach(async function () {
        sandbox.restore()
    })

    it('no SecondaryAuth set or valid PrimaryAuth exist', async function () {
        assert.strictEqual(secondaryAuth.activeConnection?.id, undefined)
    })

    it('no SecondaryAuth set but valid PrimaryAuth is used', async function () {
        await auth.useConnection(conn)
        assert.strictEqual(onDidChangeActiveConnection.calledOnce, true)
        assert.strictEqual(secondaryAuth.activeConnection?.id, conn.id)
    })

    it('valid PrimaryAuth is set BUT SecondaryAuth is already using the same connection', async function () {
        await secondaryAuth.useNewConnection(conn)
        // we save this connection so we expect it to trigger an event
        assert.strictEqual(onDidChangeActiveConnection.called, true)
        onDidChangeActiveConnection.resetHistory()

        await auth.useConnection(conn)
        // the PrimaryAuth uses the same connection as the secondary
        // so there is no change for the user. No need to emit event.
        assert.strictEqual(onDidChangeActiveConnection.called, false)
        assert.strictEqual(secondaryAuth.activeConnection?.id, conn.id)
    })

    it('valid PrimaryAuth changes BUT SecondaryAuth not set + valid PrimaryAuth exists', async function () {
        // Make primary auth already exist
        await auth.useConnection(conn)
        assert.strictEqual(onDidChangeActiveConnection.called, true)
        onDidChangeActiveConnection.resetHistory()

        const otherValidConn = await auth.createConnection(
            createSsoProfile('https://my.start.url', 'us-east-1', scopes)
        )
        await auth.useConnection(otherValidConn)
        assert.strictEqual(onDidChangeActiveConnection.called, true)
        assert.strictEqual(secondaryAuth.activeConnection?.id, otherValidConn.id)
    })

    it('valid PrimaryAuth deleted BUT SecondaryAuth is set', async function () {
        await secondaryAuth.useNewConnection(conn)

        // add valid connection to the PrimaryAuth
        const otherConn = await auth.createConnection(createSsoProfile('https://my.start.url', 'us-east-1', scopes))
        await auth.useConnection(otherConn)

        onDidChangeActiveConnection.resetHistory()
        await auth.deleteConnection(otherConn)

        // no event trigger when deleting PrimaryAuth since we have a secondary
        assert.strictEqual(onDidChangeActiveConnection.called, false)
        assert.strictEqual(secondaryAuth.activeConnection?.id, conn.id)
    })

    it('valid SecondaryAuth deleted BUT valid PrimaryAuth exists', async function () {
        await secondaryAuth.useNewConnection(conn)

        // add valid connection to the PrimaryAuth
        const otherConn = await auth.createConnection(createSsoProfile('https://my.start.url', 'us-east-1', scopes))
        await auth.useConnection(otherConn)
        onDidChangeActiveConnection.resetHistory()

        // delete SecondaryAuth
        await auth.deleteConnection(conn)

        // currently both Auth onDidChangeConnectionState and onDidDeleteConnection trigger
        // and we need to wait for both of the callbacks defined through them in SecondaryAuth to complete.
        // We know they all completed when SecondaryAuth.onDidChangeActiveConnection has been called twice
        await waitUntil(async () => onDidChangeActiveConnection.callCount === 2, { interval: 10, timeout: 10000 })

        // we fallback to the PrimaryAuth connection
        assert.strictEqual(onDidChangeActiveConnection.callCount, 2)
        assert.deepStrictEqual(
            {
                id: secondaryAuth.activeConnection?.id,
                label: secondaryAuth.activeConnection?.label,
            },
            {
                id: otherConn.id,
                label: otherConn.label,
            }
        )
        assert.strictEqual(secondaryAuth.activeConnection?.id, otherConn.id)
    })

    it('SecondaryAuth is invalid, but is reauthenticated elsewhere', async function () {
        // PrimaryAuth has its own conn, we don't care about this
        await auth.useConnection(conn)

        // SecondaryAuth is using an invalid conn
        const invalidConn = await auth.createInvalidSsoConnection(createBuilderIdProfile({ scopes: scopes }))
        await secondaryAuth.useNewConnection(invalidConn)

        // Run a reauthentication of the invalid conn outside of the knowledge of the SecondaryAuth
        onDidChangeActiveConnection.resetHistory()
        await auth.reauthenticate(invalidConn)

        // SecondaryAuth is aware of the change in state and emits an event to notify
        assert.strictEqual(secondaryAuth.activeConnection?.id, invalidConn.id)
        assert.strictEqual(onDidChangeActiveConnection.called, true)
        assert.strictEqual(auth.getConnectionState(invalidConn), 'valid')
    })
})
