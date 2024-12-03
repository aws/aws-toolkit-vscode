/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as sinon from 'sinon'
import assert from 'assert'
import { globals } from 'aws-core-vscode/shared'
import { LspClient } from 'aws-core-vscode/amazonq'

describe('Amazon Q LSP client', function () {
    let lspClient: LspClient
    let encryptFunc: sinon.SinonSpy

    beforeEach(async function () {
        sinon.stub(globals, 'isWeb').returns(false)
        lspClient = new LspClient()
        encryptFunc = sinon.spy(lspClient, 'encrypt')
    })

    it('encrypts payload of query ', async () => {
        await lspClient.queryVectorIndex('mock_input')
        assert.ok(encryptFunc.calledOnce)
        assert.ok(encryptFunc.calledWith(JSON.stringify({ query: 'mock_input' })))
        const value = await encryptFunc.returnValues[0]
        // verifies JWT encryption header
        assert.ok(value.startsWith(`eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0`))
    })

    it('encrypts payload of index files ', async () => {
        await lspClient.buildIndex(['fileA'], 'path', 'all')
        assert.ok(encryptFunc.calledOnce)
        assert.ok(
            encryptFunc.calledWith(
                JSON.stringify({
                    filePaths: ['fileA'],
                    projectRoot: 'path',
                    config: 'all',
                    language: '',
                })
            )
        )
        const value = await encryptFunc.returnValues[0]
        // verifies JWT encryption header
        assert.ok(value.startsWith(`eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0`))
    })

    it('encrypt removes readable information', async () => {
        const sample = 'hello'
        const encryptedSample = await lspClient.encrypt(sample)
        assert.ok(!encryptedSample.includes('hello'))
    })

    afterEach(() => {
        sinon.restore()
    })
})
