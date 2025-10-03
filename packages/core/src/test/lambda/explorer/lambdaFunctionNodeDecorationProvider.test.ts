/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as path from 'path'
import { LambdaFunctionNodeDecorationProvider } from '../../../lambda/explorer/lambdaFunctionNodeDecorationProvider'
import * as utils from '../../../lambda/utils'
import { fs } from '../../../shared/fs/fs'

describe('LambdaFunctionNodeDecorationProvider', function () {
    let provider: LambdaFunctionNodeDecorationProvider
    let getFunctionInfoStub: sinon.SinonStub
    let fsStatStub: sinon.SinonStub
    let fsReaddirStub: sinon.SinonStub

    const filepath = path.join(utils.getTempLocation('test-function', 'us-east-1'), 'index.js')
    const functionUri = vscode.Uri.parse('lambda:us-east-1/test-function')
    const fileUri = vscode.Uri.file(filepath)

    beforeEach(function () {
        provider = LambdaFunctionNodeDecorationProvider.getInstance()
        getFunctionInfoStub = sinon.stub(utils, 'getFunctionInfo')
        fsStatStub = sinon.stub(fs, 'stat')
        fsReaddirStub = sinon.stub(fs, 'readdir')
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('provideFileDecoration', function () {
        it('returns decoration for lambda URI with undeployed changes', async function () {
            getFunctionInfoStub.resolves(true)

            const decoration = await provider.provideFileDecoration(functionUri)

            assert.ok(decoration)
            assert.strictEqual(decoration.badge, 'M')
            assert.strictEqual(decoration.tooltip, 'This function has undeployed changes')
            assert.strictEqual(decoration.propagate, false)
        })

        it('returns undefined for lambda URI without undeployed changes', async function () {
            getFunctionInfoStub.resolves(false)

            const decoration = await provider.provideFileDecoration(functionUri)

            assert.strictEqual(decoration, undefined)
        })

        it('returns decoration for file URI with modifications after deployment', async function () {
            const lastDeployed = 1
            const fileModified = 2

            getFunctionInfoStub.resolves({ lastDeployed, undeployed: true })
            fsStatStub.resolves({ mtime: fileModified })

            const decoration = await provider.provideFileDecoration(fileUri)

            assert.ok(decoration)
            assert.strictEqual(decoration.badge, 'M')
            assert.strictEqual(decoration.tooltip, 'This function has undeployed changes')
            assert.strictEqual(decoration.propagate, true)
        })

        it('returns undefined for file URI without modifications after deployment', async function () {
            const lastDeployed = 2
            const fileModified = 1

            getFunctionInfoStub.resolves({ lastDeployed, undeployed: true })
            fsStatStub.resolves({ mtime: fileModified })

            const decoration = await provider.provideFileDecoration(fileUri)

            assert.strictEqual(decoration, undefined)
        })

        it('returns undefined for file URI when no deployment info exists', async function () {
            getFunctionInfoStub.resolves(undefined)

            const decoration = await provider.provideFileDecoration(fileUri)

            assert.strictEqual(decoration, undefined)
        })

        it('returns undefined for file URI that does not match lambda pattern', async function () {
            const uri = vscode.Uri.file(path.join('not', 'in', 'tmp'))

            const decoration = await provider.provideFileDecoration(uri)

            assert.strictEqual(decoration, undefined)
        })

        it('handles errors gracefully when checking file modification', async function () {
            getFunctionInfoStub.resolves(0)
            fsStatStub.rejects(new Error('File not found'))

            const decoration = await provider.provideFileDecoration(fileUri)

            assert.strictEqual(decoration, undefined)
        })
    })

    describe('addBadge', function () {
        it('fires decoration change events for both URIs', async function () {
            const fileUri = vscode.Uri.file(path.join('test', 'file.js'))
            const functionUri = vscode.Uri.parse('lambda:us-east-1/test-function')

            let eventCount = 0
            const disposable = provider.onDidChangeFileDecorations(() => {
                eventCount++
            })

            await provider.addBadge(fileUri, functionUri)

            assert.strictEqual(eventCount, 2)
            disposable.dispose()
        })
    })

    describe('getFilePaths', function () {
        it('returns all file paths recursively', async function () {
            const basePath = path.join('test', 'dir')

            // Mock first readdir call
            fsReaddirStub.onFirstCall().resolves([
                ['file1.js', vscode.FileType.File],
                ['subdir', vscode.FileType.Directory],
            ])

            // Mock second readdir call for subdirectory
            fsReaddirStub.onSecondCall().resolves([['file2.js', vscode.FileType.File]])

            // Access private method through any cast for testing
            const paths = await (provider as any).getFilePaths(basePath)

            assert.ok(paths.includes(basePath))
            assert.ok(paths.includes(path.join('test', 'dir', 'file1.js')))
            assert.ok(paths.includes(path.join('test', 'dir', 'subdir')))
            assert.ok(paths.includes(path.join('test', 'dir', 'subdir', 'file2.js')))
        })
    })
})
