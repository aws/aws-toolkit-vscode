/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { performanceTest } from '../../shared/performance/performance'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import assert from 'assert'
import { LspClient, LspController } from '../../amazonq'
import { LanguageClient, ServerOptions } from 'vscode-languageclient'
import { createTestWorkspace } from '../../test/testUtil'
import { BuildIndexRequestType, GetUsageRequestType } from '../../amazonq/lsp/types'
import { fs, getRandomString } from '../../shared'
import { FileSystem } from '../../shared/fs/fs'
import { getFsCallsUpperBound } from './utilities'

interface SetupResult {
    clientReqStub: sinon.SinonStub
    fsSpy: sinon.SinonSpiedInstance<FileSystem>
    findFilesSpy: sinon.SinonSpy
}

async function verifyResult(setup: SetupResult) {
    assert.ok(setup.clientReqStub.calledTwice)
    assert.ok(setup.clientReqStub.firstCall.calledWith(BuildIndexRequestType))
    assert.ok(setup.clientReqStub.secondCall.calledWith(GetUsageRequestType))

    assert.strictEqual(getFsCallsUpperBound(setup.fsSpy), 0, 'should not make any fs calls')
    assert.ok(setup.findFilesSpy.callCount <= 2, 'findFiles should not be called more than twice')
}

async function setupWithWorkspace(numFiles: number, options: { fileContent: string }): Promise<SetupResult> {
    // Force VSCode to find my test workspace only to keep test contained and controlled.
    const testWorksapce = await createTestWorkspace(numFiles, options)
    sinon.stub(vscode.workspace, 'workspaceFolders').value([testWorksapce])

    // Avoid sending real request to lsp.
    const clientReqStub = sinon.stub(LanguageClient.prototype, 'sendRequest').resolves(true)
    const fsSpy = sinon.spy(fs)
    const findFilesSpy = sinon.spy(vscode.workspace, 'findFiles')
    LspClient.instance.client = new LanguageClient('amazonq', 'test-client', {} as ServerOptions, {})
    return { clientReqStub, fsSpy, findFilesSpy }
}

describe('buildIndex', function () {
    describe('performanceTests', function () {
        afterEach(function () {
            sinon.restore()
        })
        performanceTest({}, 'indexing many small files', function () {
            return {
                setup: async () => setupWithWorkspace(250, { fileContent: '0123456789' }),
                execute: async () => {
                    await LspController.instance.buildIndex({
                        startUrl: '',
                        maxIndexSize: 30,
                        isVectorIndexEnabled: true,
                    })
                },
                verify: verifyResult,
            }
        })
        performanceTest({}, 'indexing few large files', function () {
            return {
                setup: async () => setupWithWorkspace(10, { fileContent: getRandomString(1000) }),
                execute: async () => {
                    await LspController.instance.buildIndex({
                        startUrl: '',
                        maxIndexSize: 30,
                        isVectorIndexEnabled: true,
                    })
                },
                verify: verifyResult,
            }
        })
    })
})
