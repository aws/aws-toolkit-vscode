/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    AuthError,
    AuthSSOServer,
    InvalidStateError,
    MissingCodeError,
    MissingStateError,
} from '../../../auth/sso/server'
import request from '../../../common/request'
import { URLSearchParams } from 'url'
import { isUserCancelledError, ToolkitError } from '../../../shared/errors'
import { sleep } from '../../../shared/utilities/timeoutUtils'

describe('AuthSSOServer', function () {
    const code = 'zfhgaiufgsbdfigsdfg'
    const state = 'state'
    const error = 'foo'
    const errorDescription = 'foo'

    let server: AuthSSOServer

    beforeEach(async function () {
        server = AuthSSOServer.init(state)
        await server.start()
    })

    afterEach(async function () {
        await server.close()
    })

    function createURL(baseUrl: string, params: Record<string, string>) {
        const url = new URL(baseUrl)
        url.search = new URLSearchParams(params).toString()
        return url.toString()
    }

    async function assertRequestError(params: Record<string, string>, expectedErrorMsg: string) {
        const url = createURL(server.redirectUri, params)
        const authorizationPromise = server.waitForAuthorization()
        try {
            await request.fetch('GET', url, {
                redirect: 'follow',
            }).response
        } catch (err: unknown) {
            assert.fail('Unknown error')
        }

        try {
            await authorizationPromise
        } catch (err: unknown) {
            if (err instanceof ToolkitError) {
                assert.deepStrictEqual(err.message, expectedErrorMsg)
                return
            }
            assert.fail('Unknown error')
        }
    }

    it('rejects origin', async function () {
        // TODO
    })

    it('handles authentication error', async function () {
        await assertRequestError(
            {
                error,
                error_description: errorDescription,
            },
            new AuthError(error, errorDescription).message
        )
    })

    it('handles missing code param', async function () {
        await assertRequestError(
            {
                state,
            },
            new MissingCodeError().message
        )
    })

    it('handles missing state param', async function () {
        await assertRequestError(
            {
                code,
            },
            new MissingStateError().message
        )
    })

    it('handles invalid state param', async function () {
        await assertRequestError(
            {
                code,
                state: 'someInvalidState',
            },
            new InvalidStateError().message
        )
    })

    it('handles valid redirect', async function () {
        const url = createURL(server.redirectUri, {
            code,
            state,
        })
        const response = await request.fetch('GET', url).response
        assert.deepStrictEqual(response.status, 200)

        const token = await server.waitForAuthorization()
        assert.deepStrictEqual(code, token.unwrap())
    })

    it('address is bound to localhost', function () {
        const address = server.getAddress()
        if (address instanceof Object) {
            assert.deepStrictEqual(address.address, '127.0.0.1')
            return
        }
        assert.fail('Expected address 127.0.0.1')
    })

    it('can be cancelled while waiting for auth', async function () {
        const promise = server.waitForAuthorization().catch(e => {
            return e
        })
        server.cancelCurrentFlow()

        const err = await promise
        assert.ok(isUserCancelledError(err.inner), 'CancellationError not thrown.')
    })

    it('initializes and closes instances', async function () {
        const newServer = AuthSSOServer.init('1234')
        assert.equal(AuthSSOServer.lastInstance, newServer)
        await sleep(100)
        assert.ok(server.closed)
    })
})
