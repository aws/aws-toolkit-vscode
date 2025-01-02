/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import sinon from 'sinon'
import { join } from 'path'
import { getTestWorkspaceFolder } from 'aws-core-vscode/test'
import { CodeAnalysisScope, CodeWhispererConstants, ZipUtil } from 'aws-core-vscode/codewhisperer'
import { codeScanTruncDirPrefix } from 'aws-core-vscode/codewhisperer'
import { tempDirPath, ToolkitError } from 'aws-core-vscode/shared'
import { LspClient } from 'aws-core-vscode/amazonq'
import { fs } from 'aws-core-vscode/shared'
import path from 'path'
import JSZip from 'jszip'

describe('zipUtil', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')
    const appCodePathWithRepeatedProjectName = join(workspaceFolder, 'workspaceFolder', 'App.java')

    describe('getProjectPaths', function () {
        it('Should return the correct project paths', function () {
            const zipUtil = new ZipUtil()
            assert.deepStrictEqual(zipUtil.getProjectPaths(), [workspaceFolder])
        })

        it('Should return the correct project path for unit test generation', function () {
            const zipUtil = new ZipUtil()
            assert.deepStrictEqual(zipUtil.getProjectPath(appCodePath), workspaceFolder)
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
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), CodeAnalysisScope.FILE_AUTO)
            assert.strictEqual(zipMetadata.lines, 49)
            assert.ok(zipMetadata.rootDir.includes(codeScanTruncDirPrefix))
            assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
            assert.strictEqual(zipMetadata.scannedFiles.size, 1)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.ok(zipMetadata.zipFileSizeInBytes > 0)
            assert.ok(zipMetadata.zipFilePath.includes(codeScanTruncDirPrefix))
        })

        it('Should throw error if payload size limit is reached for file scan', async function () {
            sinon.stub(zipUtil, 'reachSizeLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), CodeAnalysisScope.FILE_AUTO),
                new ToolkitError(`Payload size limit reached`, { code: 'FileSizeExceeded' })
            )
        })

        it('Should generate zip for project scan and return expected metadata', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), CodeAnalysisScope.PROJECT)
            assert.ok(zipMetadata.lines > 0)
            assert.ok(zipMetadata.rootDir.includes(codeScanTruncDirPrefix))
            assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
            assert.ok(zipMetadata.scannedFiles.size > 0)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.ok(zipMetadata.zipFileSizeInBytes > 0)
            assert.ok(zipMetadata.zipFilePath.includes(codeScanTruncDirPrefix))
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
            void vscode.window.activeTextEditor?.edit((editBuilder) => {
                editBuilder.insert(new vscode.Position(0, 0), '// a comment\n')
            })

            const zipMetadata2 = await new ZipUtil().generateZip(
                vscode.Uri.file(appCodePath),
                CodeAnalysisScope.PROJECT
            )
            assert.equal(zipMetadata2.lines, zipMetadata.lines + 1)
        })

        it('should handle path with repeated project name for file scan', async function () {
            const zipMetadata = await zipUtil.generateZip(
                vscode.Uri.file(appCodePathWithRepeatedProjectName),
                CodeAnalysisScope.FILE_ON_DEMAND
            )

            const zipFileData = await fs.readFileBytes(zipMetadata.zipFilePath)
            const zip = await JSZip.loadAsync(zipFileData)
            const files = Object.keys(zip.files)
            assert.ok(files.includes(join('workspaceFolder', 'workspaceFolder', 'App.java')))
        })

        it('should handle path with repeated project name for project scan', async function () {
            const zipMetadata = await zipUtil.generateZip(
                vscode.Uri.file(appCodePathWithRepeatedProjectName),
                CodeAnalysisScope.PROJECT
            )

            const zipFileData = await fs.readFileBytes(zipMetadata.zipFilePath)
            const zip = await JSZip.loadAsync(zipFileData)
            const files = Object.keys(zip.files)
            assert.ok(files.includes(join('workspaceFolder', 'workspaceFolder', 'App.java')))
        })
    })

    describe('generateZipTestGen', function () {
        let zipUtil: ZipUtil
        let getZipDirPathStub: sinon.SinonStub
        let testTempDirPath: string

        beforeEach(function () {
            zipUtil = new ZipUtil()
            testTempDirPath = path.join(tempDirPath, CodeWhispererConstants.TestGenerationTruncDirPrefix)
            getZipDirPathStub = sinon.stub(zipUtil, 'getZipDirPath')
            getZipDirPathStub.callsFake(() => testTempDirPath)
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should generate zip for test generation successfully', async function () {
            const mkdirSpy = sinon.spy(fs, 'mkdir')

            const result = await zipUtil.generateZipTestGen(appRoot, false)

            assert.ok(mkdirSpy.calledWith(path.join(testTempDirPath, 'utgRequiredArtifactsDir')))
            assert.ok(
                mkdirSpy.calledWith(path.join(testTempDirPath, 'utgRequiredArtifactsDir', 'buildAndExecuteLogDir'))
            )
            assert.ok(mkdirSpy.calledWith(path.join(testTempDirPath, 'utgRequiredArtifactsDir', 'repoMapData')))
            assert.ok(mkdirSpy.calledWith(path.join(testTempDirPath, 'utgRequiredArtifactsDir', 'testCoverageDir')))

            assert.strictEqual(result.rootDir, testTempDirPath)
            assert.strictEqual(result.zipFilePath, testTempDirPath + CodeWhispererConstants.codeScanZipExt)
            assert.ok(result.srcPayloadSizeInBytes > 0)
            assert.strictEqual(result.buildPayloadSizeInBytes, 0)
            assert.ok(result.zipFileSizeInBytes > 0)
            assert.strictEqual(result.lines, 150)
            assert.strictEqual(result.language, 'java')
            assert.strictEqual(result.scannedFiles.size, 4)
        })

        it('Should handle file system errors during directory creation', async function () {
            sinon.stub(LspClient, 'instance').get(() => ({
                getRepoMapJSON: sinon.stub().resolves('{"mock": "data"}'),
            }))
            sinon.stub(fs, 'mkdir').rejects(new Error('Directory creation failed'))

            await assert.rejects(() => zipUtil.generateZipTestGen(appRoot, false), /Directory creation failed/)
        })

        it('Should handle zip project errors', async function () {
            sinon.stub(LspClient, 'instance').get(() => ({
                getRepoMapJSON: sinon.stub().resolves('{"mock": "data"}'),
            }))
            sinon.stub(zipUtil, 'zipProject' as keyof ZipUtil).rejects(new Error('Zip failed'))

            await assert.rejects(() => zipUtil.generateZipTestGen(appRoot, false), /Zip failed/)
        })

        it('Should handle file copy to downloads folder error', async function () {
            // Mock LSP client
            sinon.stub(LspClient, 'instance').get(() => ({
                getRepoMapJSON: sinon.stub().resolves('{"mock": "data"}'),
            }))

            const mkdirSpy = sinon.spy(fs, 'mkdir')
            sinon.stub(fs, 'exists').resolves(true)
            sinon.stub(fs, 'copy').rejects(new Error('Copy failed'))

            await assert.rejects(() => zipUtil.generateZipTestGen(appRoot, false), /Copy failed/)

            // Verify mkdir was called for all directories
            assert(mkdirSpy.called, 'mkdir should have been called')
            assert.strictEqual(mkdirSpy.callCount, 4, 'mkdir should have been called 4 times')
        })
    })
})
