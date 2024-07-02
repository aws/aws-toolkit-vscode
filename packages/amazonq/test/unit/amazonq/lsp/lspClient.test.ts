import * as sinon from 'sinon'
import assert from 'assert'
import { LspClient } from 'aws-core-vscode/amazonq'

describe('Test LSP client', function () {
    let lspClient: LspClient
    let encryptFunc: sinon.SinonSpy

    beforeEach(function () {
        lspClient = new LspClient()
        encryptFunc = sinon.spy(lspClient, 'encrypt')
    })

    it('should encrypt payload of query ', async () => {
        await lspClient.query('mock_input')
        assert.ok(encryptFunc.calledOnce)
        assert.ok(encryptFunc.calledWith(JSON.stringify({ query: 'mock_input' })))
    })

    it('should encrypt payload of index files ', async () => {
        await lspClient.indexFiles(['fileA'], 'path', false)
        assert.ok(encryptFunc.calledOnce)
        assert.ok(
            encryptFunc.calledWith(
                JSON.stringify({
                    filePaths: ['fileA'],
                    rootPath: 'path',
                    refresh: false,
                })
            )
        )
    })

    afterEach(() => {
        sinon.restore()
    })
})
