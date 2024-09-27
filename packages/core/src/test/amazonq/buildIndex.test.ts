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
import { createTestWorkspace } from '../testUtil'

describe('buildIndex', function () {
    describe('performanceTests', function () {
        afterEach(function () {
            sinon.restore()
        })
        performanceTest({}, 'performance test', function () {
            return {
                setup: async () => {
                    const testWorksapce = createTestWorkspace(100, {
                        fileNamePrefix: 'fake-file',
                        fileContent: '0123456789',
                    })

                    // Avoid sending real request to lsp.
                    sinon.stub(LanguageClient.prototype, 'sendRequest').resolves(true)
                    // Force VSCode to find my test workspace only to keep test contained and controlled.
                    sinon.stub(vscode.workspace, 'workspaceFolders').resolves([testWorksapce])
                    LspClient.instance.client = new LanguageClient('amazonq', 'test-client', {} as ServerOptions, {})
                    return
                },
                execute: async () => {
                    await LspController.instance.buildIndex()
                },
                verify: async () => {},
            }
        })
    })
})
