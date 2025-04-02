/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { AmazonQLspAuth } from '../../../../src/lsp/auth'
import { LanguageClient } from 'vscode-languageclient'

describe('AmazonQLspAuth', function () {
    describe('updateBearerToken', function () {
        it('makes request to LSP when token changes', async function () {
            // Note: this token will be encrypted
            let lastSentToken = {}
            const auth = new AmazonQLspAuth({
                sendRequest: (_method: string, param: any) => {
                    lastSentToken = param
                },
                info: (_message: string, _data: any) => {},
            } as LanguageClient)

            await auth.updateBearerToken('firstToken')
            assert.notDeepStrictEqual(lastSentToken, {})
            const encryptedFirstToken = lastSentToken

            await auth.updateBearerToken('secondToken')
            assert.notDeepStrictEqual(lastSentToken, encryptedFirstToken)
            const encryptedSecondToken = lastSentToken

            await auth.updateBearerToken('secondToken')
            assert.deepStrictEqual(lastSentToken, encryptedSecondToken)
        })
    })
})
