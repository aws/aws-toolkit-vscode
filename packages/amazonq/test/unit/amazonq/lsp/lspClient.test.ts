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
        await lspClient.query('mock_input')
        assert.ok(encryptFunc.calledOnce)
        assert.ok(encryptFunc.calledWith(JSON.stringify({ query: 'mock_input' })))
        assert.strictEqual(encryptFunc.returnValues[0], '')
    })

    it('encrypts payload of index files ', async () => {
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
        assert.strictEqual(encryptFunc.returnValues[0], '')
    })

    afterEach(() => {
        sinon.restore()
    })
})
