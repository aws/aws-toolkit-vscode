/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import sinon from 'sinon'
import { join } from 'path'
import path from 'path'
import JSZip from 'jszip'
import { getTestWorkspaceFolder } from '../../testInteg/integrationTestsUtilities'
import { ZipUtil } from '../../codewhisperer/util/zipUtil'
import { codeScanTruncDirPrefix } from '../../codewhisperer/models/constants'
import { ToolkitError } from '../../shared/errors'
import { fs } from '../../shared/fs/fs'
import { tempDirPath } from '../../shared/filesystemUtilities'
import { CodeWhispererConstants } from '../../codewhisperer/indexNode'
import { LspClient } from '../../amazonq/lsp/lspClient'

describe('zipUtil', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')
    const appCodePathWithRepeatedProjectName = join(workspaceFolder, 'workspaceFolder', 'App.java')

    it('returns the proper size limit for zip', function () {
        assert.strictEqual(
            ZipUtil.aboveByteLimit(CodeWhispererConstants.fileScanPayloadSizeLimitBytes + 1, 'file'),
            true
        )

        assert.strictEqual(
            ZipUtil.aboveByteLimit(CodeWhispererConstants.projectScanPayloadSizeLimitBytes + 1, 'project'),
            true
        )

        assert.strictEqual(
            ZipUtil.aboveByteLimit(CodeWhispererConstants.fileScanPayloadSizeLimitBytes - 1, 'file'),
            false
        )

        assert.strictEqual(
            ZipUtil.aboveByteLimit(CodeWhispererConstants.projectScanPayloadSizeLimitBytes - 1, 'project'),
            false
        )
    })

    it('determines if adding file will exceed project byte limit', function () {
        assert.strictEqual(
            ZipUtil.willReachProjectByteLimit(CodeWhispererConstants.projectScanPayloadSizeLimitBytes, 1),
            true
        )

        assert.strictEqual(
            ZipUtil.willReachProjectByteLimit(CodeWhispererConstants.projectScanPayloadSizeLimitBytes - 10, 9),
            false
        )
    })

    describe('generateZip', function () {
        let zipUtil: ZipUtil
        beforeEach(function () {
            zipUtil = new ZipUtil(CodeWhispererConstants.codeScanTruncDirPrefix)
        })
        afterEach(function () {
            sinon.restore()
        })

        it('Should generate zip for file scan and return expected metadata', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), 'file', {
                includeGitDiffHeader: true,
            })
            assert.strictEqual(zipMetadata.lines, 49)
            assert.ok(zipMetadata.rootDir.includes(codeScanTruncDirPrefix))
            assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
            assert.strictEqual(zipMetadata.scannedFiles.size, 1)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.ok(zipMetadata.zipFileSizeInBytes > 0)
            assert.ok(zipMetadata.zipFilePath.includes(codeScanTruncDirPrefix))
        })

        it('Should throw error if payload size limit is reached for file scan', async function () {
            sinon.stub(ZipUtil, 'aboveByteLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), 'file', { includeGitDiffHeader: true }),
                new ToolkitError(`Payload size limit reached`, { code: 'FileSizeExceeded' })
            )
        })

        it('Should generate zip for project scan and return expected metadata', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), 'project')
            assert.ok(zipMetadata.lines > 0)
            assert.ok(zipMetadata.rootDir.includes(codeScanTruncDirPrefix))
            assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
            assert.ok(zipMetadata.scannedFiles.size > 0)
            assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
            assert.ok(zipMetadata.zipFileSizeInBytes > 0)
            assert.ok(zipMetadata.zipFilePath.includes(codeScanTruncDirPrefix))
        })

        it('Should throw error if payload size limit is reached for project scan', async function () {
            sinon.stub(ZipUtil, 'aboveByteLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), 'project'),
                new ToolkitError('Payload size limit reached', { code: 'ProjectSizeExceeded' })
            )
        })

        it('Should throw error if payload size limit will be reached for project scan', async function () {
            sinon.stub(ZipUtil, 'aboveByteLimit').returns(true)

            await assert.rejects(
                () => zipUtil.generateZip(vscode.Uri.file(appCodePath), 'project'),
                new ToolkitError('Payload size limit reached', { code: 'ProjectSizeExceeded' })
            )
        })

        it('Should read file content instead of from disk if file is dirty', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePath), 'project')

            const document = await vscode.workspace.openTextDocument(appCodePath)
            await vscode.window.showTextDocument(document)
            void vscode.window.activeTextEditor?.edit((editBuilder) => {
                editBuilder.insert(new vscode.Position(0, 0), '// a comment\n')
            })

            const zipMetadata2 = await new ZipUtil(CodeWhispererConstants.codeScanTruncDirPrefix).generateZip(
                vscode.Uri.file(appCodePath),
                'project'
            )
            assert.equal(zipMetadata2.lines, zipMetadata.lines + 1)
        })

        it('should handle path with repeated project name for file scan', async function () {
            const zipMetadata = await zipUtil.generateZip(vscode.Uri.file(appCodePathWithRepeatedProjectName), 'file')

            const zipFileData = await fs.readFileBytes(zipMetadata.zipFilePath)
            const zip = await JSZip.loadAsync(zipFileData)
            const files = Object.keys(zip.files)
            assert.ok(files.includes(join('workspaceFolder', 'workspaceFolder', 'App.java')))
        })

        it('should handle path with repeated project name for project scan', async function () {
            const zipMetadata = await zipUtil.generateZip(
                vscode.Uri.file(appCodePathWithRepeatedProjectName),
                'project'
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
            zipUtil = new ZipUtil(CodeWhispererConstants.TestGenerationTruncDirPrefix)
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
    })
})
