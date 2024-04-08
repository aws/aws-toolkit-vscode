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
import request, { RequestError } from '../../../common/request'
import { URLSearchParams } from 'url'

describe('AuthSSOServer', function () {
    const code = 'zfhgaiufgsbdfigsdfg'
    const state = 'state'
    const error = 'foo'
    const errorDescription = 'foo'

    let server: AuthSSOServer

    beforeEach(async function () {
        server = new AuthSSOServer(state, 'vscode://foo')
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

    async function createRequest(params: Record<string, string>, expectedErrorMsg?: string) {
        const url = createURL(server.redirectUri, params)
        try {
            const response = await request.fetch('GET', url).response
            assert.fail(`Expected error but found ${response.body}`)
        } catch (err: unknown) {
            if (err instanceof RequestError) {
                assert.strictEqual(err.code, 400)
                assert.deepStrictEqual(err.body, expectedErrorMsg)
                return
            }
            assert.fail('Unknown error')
        }
    }

    it('rejects origin', async function () {
        // TODO
    })

    it('handles authentication error', async function () {
        await createRequest(
            {
                error,
                error_description: errorDescription,
            },
            new AuthError(error, errorDescription).message
        )
    })

    it('handles missing code param', async function () {
        await createRequest(
            {
                state,
            },
            new MissingCodeError().message
        )
    })

    it('handles missing state param', async function () {
        await createRequest(
            {
                code,
            },
            new MissingStateError().message
        )
    })

    it('handles invalid state param', async function () {
        await createRequest(
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
        assert.deepStrictEqual(code, token)
    })
})
