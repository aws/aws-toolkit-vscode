/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import sinon from 'sinon'
import { join } from 'path'
import { getTestWorkspaceFolder } from 'aws-core-vscode/testInteg'
import { CodeAnalysisScope, ZipUtil } from 'aws-core-vscode/codewhisperer'
import { CodeWhispererConstants } from 'aws-core-vscode/codewhisperer'
import { ToolkitError } from 'aws-core-vscode/shared'

describe('zipUtil', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')

    describe('getProjectPaths', function () {
        it('Should return the correct project paths', function () {
            const zipUtil = new ZipUtil()
            assert.deepStrictEqual(zipUtil.getProjectPaths(), [workspaceFolder])
        })
    })

    describe('generateZip', function () {
        let zipUtil: ZipUtil
        beforeEach(function () {
            zipUtil = new ZipUtil()
        })
        afterEach(function () {
            sinon.restore()
        })

        it('Should generate zip for file scan and return expected metadata', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), CodeAnalysisScope.FILE)
            assert.strictEqual(zipMetadata.lines, 49)
            assert.ok(zipMetadata.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
            assert.strictEqual(zipMetadata.scannedFiles.size, 1)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.ok(zipMetadata.zipFileSizeInBytes > 0)
            assert.ok(zipMetadata.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
        })

        it('Should throw error if payload size limit is reached for file scan', async function () {
            sinon.stub(zipUtil, 'reachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), CodeAnalysisScope.FILE),
                new ToolkitError(`Payload size limit reached`, { code: 'FileSizeExceeded' })
            )
        })

        it('Should generate zip for project scan and return expected metadata', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), CodeAnalysisScope.PROJECT)
            assert.ok(zipMetadata.lines > 0)
            assert.ok(zipMetadata.rootDir.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
            assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
            assert.ok(zipMetadata.scannedFiles.size > 0)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.ok(zipMetadata.zipFileSizeInBytes > 0)
            assert.ok(zipMetadata.zipFilePath.includes(CodeWhispererConstants.codeScanTruncDirPrefix))
        })

        it('Should throw error if payload size limit is reached for project scan', async function () {
            sinon.stub(zipUtil, 'reachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), CodeAnalysisScope.PROJECT),
                new ToolkitError('Payload size limit reached', { code: 'ProjectSizeExceeded' })
            )
        })

        it('Should throw error if payload size limit will be reached for project scan', async function () {
            sinon.stub(zipUtil, 'willReachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), CodeAnalysisScope.PROJECT),
                new ToolkitError('Payload size limit reached', { code: 'ProjectSizeExceeded' })
            )
        })

        it('Should throw error if scan type is invalid', async function () {
            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), 'unknown' as CodeAnalysisScope),
                new ToolkitError('Unknown code analysis scope: unknown')
            )
        })

        it('Should read file content instead of from disk if file is dirty', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), CodeAnalysisScope.PROJECT)

            const document = await vscode.workspace.openTextDocument(appCodePath)
            await vscode.window.showTextDocument(document)
            void vscode.window.activeTextEditor?.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(0, 0), '// a comment\n')
            })

            const zipMetadata2 = await new ZipUtil().generateZip(
                vscode.Uri.file(appCodePath),
                CodeAnalysisScope.PROJECT
            )
            assert.equal(zipMetadata2.lines, zipMetadata.lines + 1)
        })
    })
})
