/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { AmazonQLspAuth } from '../../../../src/lsp/auth'
import { LanguageClient } from 'vscode-languageclient'

describe('AmazonQLspAuth', function () {
    let requestsMade: { method: string; param: any }[]
    const stubLanguageClient = {
        sendRequest: (method: string, param: any) => {
            requestsMade.push({ method, param })
        },
        info: (_message: string, _data: any) => {},
    } as LanguageClient

    beforeEach(function () {
        requestsMade = []
    })

    it('sends the bearer token, then the profile', async function () {
        await AmazonQLspAuth.initialize(stubLanguageClient)
        assert.strictEqual(requestsMade.length, 2)
        const [firstRequest, secondRequest] = requestsMade
        assert.strictEqual(firstRequest.method, 'aws/credentials/token/update')
        assert.strictEqual(secondRequest.method, 'aws/updateConfiguration')
    })

    describe('updateBearerToken', function () {
        it('makes request to LSP when token changes', async function () {
            const auth = await AmazonQLspAuth.initialize(stubLanguageClient)

            await auth.updateBearerToken('firstToken')
            const firstRequest = requestsMade.at(-1)
            assert.ok(firstRequest)
            const firstTokenPushed = firstRequest.param.data
            assert.strictEqual(firstRequest.method, 'aws/credentials/token/update')
            assert.notStrictEqual(firstTokenPushed, '')

            await auth.updateBearerToken('secondToken')
            const secondRequest = requestsMade.at(-1)
            assert.ok(secondRequest)
            const secondTokenPushed = secondRequest.param.data
            assert.notStrictEqual(secondTokenPushed, firstTokenPushed)

            const lengthBefore = requestsMade.length
            await auth.updateBearerToken('secondToken')
            const lengthAfter = requestsMade.length
            assert.strictEqual(
                lengthBefore,
                lengthAfter,
                'should not make requests to language server if token does not change'
            )
        })
    })
})
