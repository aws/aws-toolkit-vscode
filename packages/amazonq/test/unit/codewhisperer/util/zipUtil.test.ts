/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import sinon from 'sinon'
import { join } from 'path'
import { getTestWorkspaceFolder } from 'aws-core-vscode/test'
import { CodeAnalysisScope, ZipUtil } from 'aws-core-vscode/codewhisperer'
import { codeScanTruncDirPrefix } from 'aws-core-vscode/codewhisperer'
import { ToolkitError } from 'aws-core-vscode/shared'
import { LspClient } from 'aws-core-vscode/amazonq'
import { fs } from 'aws-core-vscode/shared'
import path from 'path'
import JSZip from 'jszip'

describe('zipUtil', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')

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

        it('should handle path with repeated project name', async function () {
            const appCodePathWithRepeatedProjectName = join(workspaceFolder, 'workspaceFolder', 'App.java')
            const zipMetadata = await zipUtil.generateZip(
                vscode.Uri.file(appCodePathWithRepeatedProjectName),
                CodeAnalysisScope.FILE_ON_DEMAND
            )

            const zipFileData = await fs.readFileBytes(zipMetadata.zipFilePath)
            const zip = await JSZip.loadAsync(zipFileData)
            const files = Object.keys(zip.files)
            assert.equal(files.length, 2)
            assert.ok(files.includes('codeDiff/code.diff'))
            assert.ok(files.includes('workspaceFolder/workspaceFolder/App.java'))
        })
    })

    describe('generateZipTestGen', function () {
        let zipUtil: ZipUtil
        let mockFs: sinon.SinonStubbedInstance<typeof fs>
        const projectPath = '/test/project'
        const zipDirPath = '/test/zip'
        const zipFilePath = '/test/zip/test.zip'

        beforeEach(function () {
            zipUtil = new ZipUtil()
            mockFs = sinon.stub(fs)

            const mockRepoMapPath = '/path/to/repoMapData.json'
            mockFs.exists.withArgs(mockRepoMapPath).resolves(true)
            sinon.stub(LspClient, 'instance').get(() => ({
                getRepoMapJSON: sinon.stub().resolves(mockRepoMapPath),
            }))

            sinon.stub(zipUtil, 'getZipDirPath').returns(zipDirPath)
            sinon.stub(zipUtil as any, 'zipProject').resolves(zipFilePath)
        })

        afterEach(function () {
            sinon.restore()
        })

        it('Should generate zip for test generation successfully', async function () {
            mockFs.stat.resolves({
                type: vscode.FileType.File,
                size: 1000,
                ctime: Date.now(),
                mtime: Date.now(),
            } as vscode.FileStat)

            mockFs.readFileBytes.resolves(Buffer.from('test content'))

            // Fix: Create a Set from the array
            zipUtil['_totalSize'] = 500
            zipUtil['_totalBuildSize'] = 200
            zipUtil['_totalLines'] = 100
            zipUtil['_language'] = 'typescript'
            zipUtil['_pickedSourceFiles'] = new Set(['file1.ts', 'file2.ts'])

            const result = await zipUtil.generateZipTestGen(projectPath, false)

            assert.ok(mockFs.mkdir.calledWith(path.join(zipDirPath, 'utgRequiredArtifactsDir')))
            assert.ok(
                mockFs.mkdir.calledWith(path.join(zipDirPath, 'utgRequiredArtifactsDir', 'buildAndExecuteLogDir'))
            )
            assert.ok(mockFs.mkdir.calledWith(path.join(zipDirPath, 'utgRequiredArtifactsDir', 'repoMapData')))
            assert.ok(mockFs.mkdir.calledWith(path.join(zipDirPath, 'utgRequiredArtifactsDir', 'testCoverageDir')))

            // assert.ok(
            //     mockFs.copy.calledWith(
            //         '/path/to/repoMapData.json',
            //         path.join(zipDirPath, 'utgRequiredArtifactsDir', 'repoMapData', 'repoMapData.json')
            //     )
            // )

            assert.strictEqual(result.rootDir, zipDirPath)
            assert.strictEqual(result.zipFilePath, zipFilePath)
            assert.strictEqual(result.srcPayloadSizeInBytes, 500)
            assert.strictEqual(result.buildPayloadSizeInBytes, 200)
            assert.strictEqual(result.zipFileSizeInBytes, 1000)
            assert.strictEqual(result.lines, 100)
            assert.strictEqual(result.language, 'typescript')
            assert.deepStrictEqual(Array.from(result.scannedFiles), ['file1.ts', 'file2.ts'])
        })

        // it('Should handle LSP client error', async function () {
        //     // Override the default stub with one that rejects
        //     sinon.stub(LspClient, 'instance').get(() => ({
        //         getRepoMapJSON: sinon.stub().rejects(new Error('LSP error')),
        //     }))

        //     await assert.rejects(() => zipUtil.generateZipTestGen(projectPath), /LSP error/)
        // })

        it('Should handle file system errors during directory creation', async function () {
            sinon.stub(LspClient, 'instance').get(() => ({
                getRepoMapJSON: sinon.stub().resolves('{"mock": "data"}'),
            }))
            mockFs.mkdir.rejects(new Error('Directory creation failed'))

            await assert.rejects(() => zipUtil.generateZipTestGen(projectPath, false), /Directory creation failed/)
        })

        it('Should handle zip project errors', async function () {
            sinon.stub(LspClient, 'instance').get(() => ({
                getRepoMapJSON: sinon.stub().resolves('{"mock": "data"}'),
            }))
            ;(zipUtil as any).zipProject.rejects(new Error('Zip failed'))

            await assert.rejects(() => zipUtil.generateZipTestGen(projectPath, false), /Zip failed/)
        })

        it('Should handle file copy to downloads folder error', async function () {
            // Mock LSP client
            sinon.stub(LspClient, 'instance').get(() => ({
                getRepoMapJSON: sinon.stub().resolves('{"mock": "data"}'),
            }))

            // Mock file operations
            const mockFs = {
                mkdir: sinon.stub().resolves(),
                copy: sinon.stub().rejects(new Error('Copy failed')),
                exists: sinon.stub().resolves(true),
                stat: sinon.stub().resolves({
                    type: vscode.FileType.File,
                    size: 1000,
                    ctime: Date.now(),
                    mtime: Date.now(),
                } as vscode.FileStat),
            }

            // Since the function now uses Promise.all for directory creation and file operations,
            // we need to ensure the mkdir succeeds but the copy fails
            fs.mkdir = mockFs.mkdir
            fs.copy = mockFs.copy
            fs.exists = mockFs.exists
            fs.stat = mockFs.stat

            await assert.rejects(() => zipUtil.generateZipTestGen(projectPath, false), /Copy failed/)

            // Verify mkdir was called for all directories
            assert(mockFs.mkdir.called, 'mkdir should have been called')
            assert.strictEqual(mockFs.mkdir.callCount, 4, 'mkdir should have been called 4 times')
        })
    })
})
