/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { performanceTest } from '../shared/performance/performance'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import assert from 'assert'
import { LspClient, LspController } from '../amazonq'
import { LanguageClient, ServerOptions } from 'vscode-languageclient'
import { createTestWorkspace } from '../test/testUtil'
import { GetUsageRequestType, IndexRequestType } from '../amazonq/lsp/types'
import { getRandomString } from '../shared'

interface SetupResult {
    clientReqStub: sinon.SinonStub
}

async function verifyResult(setup: SetupResult) {
    assert.ok(setup.clientReqStub.calledTwice)
    assert.ok(setup.clientReqStub.firstCall.calledWith(IndexRequestType))
    assert.ok(setup.clientReqStub.secondCall.calledWith(GetUsageRequestType))
}

async function setupWithWorkspace(numFiles: number, options: { fileContent: string }): Promise<SetupResult> {
    // Force VSCode to find my test workspace only to keep test contained and controlled.
    const testWorksapce = await createTestWorkspace(numFiles, options)
    sinon.stub(vscode.workspace, 'workspaceFolders').value([testWorksapce])
    // Avoid sending real request to lsp.
    const clientReqStub = sinon.stub(LanguageClient.prototype, 'sendRequest').resolves(true)
    LspClient.instance.client = new LanguageClient('amazonq', 'test-client', {} as ServerOptions, {})
    return { clientReqStub }
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
                    await LspController.instance.buildIndex()
                },
                verify: verifyResult,
            }
        })
        performanceTest({}, 'indexing few large files', function () {
            return {
                setup: async () => setupWithWorkspace(10, { fileContent: getRandomString(1000) }),
                execute: async () => {
                    await LspController.instance.buildIndex()
                },
                verify: verifyResult,
            }
        })
    })
})
