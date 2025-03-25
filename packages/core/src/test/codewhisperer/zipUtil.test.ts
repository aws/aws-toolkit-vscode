/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import path from 'path'
import sinon from 'sinon'
import { join } from 'path'
import JSZip from 'jszip'
import { getTestWorkspaceFolder } from '../../testInteg/integrationTestsUtilities'
import { ZipMetadata, ZipUtil } from '../../codewhisperer/util/zipUtil'
import { codeScanTruncDirPrefix } from '../../codewhisperer/models/constants'
import { ToolkitError } from '../../shared/errors'
import { fs } from '../../shared/fs/fs'
import { CodeWhispererConstants } from '../../codewhisperer/indexNode'
import { CurrentWsFolders, defaultExcludePatterns } from '../../shared/utilities/workspaceUtils'
import { TestFolder } from '../testUtil'

describe('zipUtil', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')
    const appCodePathWithRepeatedProjectName = join(workspaceFolder, 'workspaceFolder', 'App.java')

    let zipUtil: ZipUtil
    beforeEach(function () {
        zipUtil = new ZipUtil(CodeWhispererConstants.codeScanTruncDirPrefix)
    })

    afterEach(function () {
        sinon.restore()
    })

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

    it('generates zip for file scan and return expected metadata', async function () {
        const zipMetadata = await zipUtil.zipFile(vscode.Uri.file(appCodePath), true)
        assert.strictEqual(zipMetadata.lines, 49)
        assert.ok(zipMetadata.rootDir.includes(codeScanTruncDirPrefix))
        assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
        assert.strictEqual(zipMetadata.scannedFiles.size, 1)
        assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
        assert.ok(zipMetadata.zipFileSizeInBytes > 0)
        assert.ok(zipMetadata.zipFilePath.includes(codeScanTruncDirPrefix))
    })

    it('generates zip for project scan and return expected metadata', async function () {
        const zipMetadata = await zipUtil.zipProject(
            [...(vscode.workspace.workspaceFolders ?? [])] as CurrentWsFolders,
            defaultExcludePatterns
        )
        assert.ok(zipMetadata.lines > 0)
        assert.ok(zipMetadata.rootDir.includes(codeScanTruncDirPrefix))
        assert.ok(zipMetadata.srcPayloadSizeInBytes > 0)
        assert.ok(zipMetadata.scannedFiles.size > 0)
        assert.strictEqual(zipMetadata.buildPayloadSizeInBytes, 0)
        assert.ok(zipMetadata.zipFileSizeInBytes > 0)
        assert.ok(zipMetadata.zipFilePath.includes(codeScanTruncDirPrefix))
    })

    it('throws error if payload size limit is reached for file', async function () {
        sinon.stub(ZipUtil, 'aboveByteLimit').returns(true)

        await assert.rejects(
            () => zipUtil.zipFile(vscode.Uri.file(appCodePath), true),
            new ToolkitError(`Payload size limit reached`, { code: 'FileSizeExceeded' })
        )
    })

    it('throws error if payload size limit is reached for project', async function () {
        sinon.stub(ZipUtil, 'aboveByteLimit').returns(true)

        await assert.rejects(
            () =>
                zipUtil.zipProject(
                    [...(vscode.workspace.workspaceFolders ?? [])] as CurrentWsFolders,
                    defaultExcludePatterns
                ),
            new ToolkitError('Payload size limit reached', { code: 'ProjectSizeExceeded' })
        )
    })

    it('throws error if payload size limit will be reached for project', async function () {
        sinon.stub(ZipUtil, 'willReachProjectByteLimit').returns(true)

        await assert.rejects(
            () =>
                zipUtil.zipProject(
                    [...(vscode.workspace.workspaceFolders ?? [])] as CurrentWsFolders,
                    defaultExcludePatterns
                ),
            new ToolkitError('Payload size limit reached', { code: 'ProjectSizeExceeded' })
        )
    })

    it('reads file content instead of from disk if file is dirty', async function () {
        const zipMetadata = await zipUtil.zipProject(
            [...(vscode.workspace.workspaceFolders ?? [])] as CurrentWsFolders,
            defaultExcludePatterns
        )

        const document = await vscode.workspace.openTextDocument(appCodePath)
        await vscode.window.showTextDocument(document)
        void vscode.window.activeTextEditor?.edit((editBuilder) => {
            editBuilder.insert(new vscode.Position(0, 0), '// a comment\n')
        })

        const zipMetadata2 = await new ZipUtil(CodeWhispererConstants.codeScanTruncDirPrefix).zipProject(
            [...(vscode.workspace.workspaceFolders ?? [])] as CurrentWsFolders,
            defaultExcludePatterns
        )

        assert.equal(zipMetadata2.lines, zipMetadata.lines + 1)
    })

    it('handles path with repeated project name for file', async function () {
        const zipMetadata = await zipUtil.zipFile(vscode.Uri.file(appCodePathWithRepeatedProjectName))

        const zipFileData = await fs.readFileBytes(zipMetadata.zipFilePath)
        const zip = await JSZip.loadAsync(zipFileData)
        const files = Object.keys(zip.files)
        assert.ok(files.includes(join('workspaceFolder', 'workspaceFolder', 'App.java')))
    })

    it('handle path with repeated project name for project', async function () {
        const zipMetadata = await zipUtil.zipProject(
            [...(vscode.workspace.workspaceFolders ?? [])] as CurrentWsFolders,
            defaultExcludePatterns
        )

        const zipFileData = await fs.readFileBytes(zipMetadata.zipFilePath)
        const zip = await JSZip.loadAsync(zipFileData)
        const files = Object.keys(zip.files)
        assert.ok(files.includes(join('workspaceFolder', 'workspaceFolder', 'App.java')))
    })

    it('removes relevant files on cleanup', async function () {
        const testFolder = await TestFolder.create()
        const zipFile = 'thisIsAZip.zip'
        const zipDir = 'thisIsADir'
        await testFolder.write(zipFile, 'some content')
        await testFolder.mkdir(zipDir)
        await testFolder.write(path.join(zipDir, 'thisIsAFile.txt'), 'some content')

        const zipFolderPath = path.join(testFolder.path, zipDir)
        const zipFilePath = path.join(testFolder.path, zipFile)

        assert.strictEqual(await fs.exists(zipFilePath), true)
        assert.strictEqual(await fs.exists(zipFolderPath), true)

        await zipUtil.removeTmpFiles({
            zipFilePath: zipFilePath,
            rootDir: zipFolderPath,
        } as ZipMetadata)

        assert.strictEqual(await fs.exists(zipFilePath), false)
        assert.strictEqual(await fs.exists(zipFolderPath), false)
    })
})
