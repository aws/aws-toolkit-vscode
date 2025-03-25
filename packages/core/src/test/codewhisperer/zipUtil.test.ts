/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import path from 'path'
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
import { NoActiveFileError, NoSourceFilesError } from '../../codewhisperer/models/errors'

describe('zipUtil', function () {
    const workspaceFolder = getTestWorkspaceFolder()
    const appRoot = join(workspaceFolder, 'java11-plain-maven-sam-app')
    const appCodePath = join(appRoot, 'HelloWorldFunction', 'src', 'main', 'java', 'helloworld', 'App.java')
    const appCodePathWithRepeatedProjectName = join(workspaceFolder, 'workspaceFolder', 'App.java')

    let zipUtil: ZipUtil
    beforeEach(function () {
        zipUtil = new ZipUtil(CodeWhispererConstants.codeScanTruncDirPrefix)
    })

    it('defaults to proper size limits for zip', function () {
        assert.strictEqual(
            zipUtil.aboveByteLimit(CodeWhispererConstants.fileScanPayloadSizeLimitBytes + 1, 'file'),
            true
        )

        assert.strictEqual(
            zipUtil.aboveByteLimit(CodeWhispererConstants.projectScanPayloadSizeLimitBytes + 1, 'project'),
            true
        )

        assert.strictEqual(
            zipUtil.aboveByteLimit(CodeWhispererConstants.fileScanPayloadSizeLimitBytes - 1, 'file'),
            false
        )

        assert.strictEqual(
            zipUtil.aboveByteLimit(CodeWhispererConstants.projectScanPayloadSizeLimitBytes - 1, 'project'),
            false
        )
    })

    it('determines if adding file will exceed project byte limit', function () {
        assert.strictEqual(
            zipUtil.willReachProjectByteLimit(CodeWhispererConstants.projectScanPayloadSizeLimitBytes, 1),
            true
        )

        assert.strictEqual(
            zipUtil.willReachProjectByteLimit(CodeWhispererConstants.projectScanPayloadSizeLimitBytes - 10, 9),
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
        const limitedZipUtil = new ZipUtil(CodeWhispererConstants.codeScanTruncDirPrefix, {
            file: 1,
            project: 1,
        })
        await assert.rejects(
            () => limitedZipUtil.zipFile(vscode.Uri.file(appCodePath), true),
            new ToolkitError(`Payload size limit reached`, { code: 'FileSizeExceeded' })
        )
    })

    it('throws error if payload size limit is reached for project', async function () {
        const testWorkspace = await TestFolder.create()
        await testWorkspace.write('afile.py', '12345')
        const limitedZipUtil = new ZipUtil(CodeWhispererConstants.codeScanTruncDirPrefix, {
            file: 1,
            project: 4,
        })
        await assert.rejects(
            () =>
                limitedZipUtil.zipProject(
                    [{ uri: vscode.Uri.parse(testWorkspace.path), name: 'testWorkspace', index: 0 }],
                    defaultExcludePatterns,
                    {
                        projectPath: testWorkspace.path,
                    }
                ),
            new ToolkitError('Payload size limit reached', { code: 'ProjectSizeExceeded' })
        )
    })

    it('throws error if payload size limit will be reached for project', async function () {
        const limitedZipUtil = new ZipUtil(CodeWhispererConstants.codeScanTruncDirPrefix, {
            file: 1,
            project: 1,
        })
        await assert.rejects(
            () =>
                limitedZipUtil.zipProject(
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

    it('throws when uri is missing', async function () {
        await assert.rejects(async () => {
            await zipUtil.zipFile(undefined)
        }, new NoActiveFileError())
    })

    it('allows overriding of project paths', async function () {
        const project = await TestFolder.create()
        const fileName = 'thisIsPartOfMyProject.py'
        await project.write(fileName, 'file1')
        const zipMetadata = await zipUtil.zipProject(
            [{ uri: vscode.Uri.file(project.path), name: 'project1', index: 0 }],
            defaultExcludePatterns,
            {
                projectPath: project.path,
            }
        )

        assert.strictEqual(zipMetadata.scannedFiles.has(path.join(project.path, fileName)), true)
    })

    it('resolves the most popular language', async function () {
        const project = await TestFolder.create()
        await project.write('p1.py', '_')
        await project.write('p2.py', '_')
        await project.write('j.java', '_')
        await project.write('t.ts', '_')
        await project.write('t2.ts', '_')
        await project.write('t3.ts', '_')
        const zipMetadata = await zipUtil.zipProject(
            [{ uri: vscode.Uri.file(project.path), name: 'project1', index: 0 }],
            defaultExcludePatterns,
            {
                projectPath: project.path,
            }
        )

        assert.strictEqual(zipMetadata.language, 'typescript')
    })

    it('able to process files outside of workspace', async function () {
        const project = await TestFolder.create()
        const fileName = 'thisIsPartOfMyProject.py'
        await project.write(fileName, 'file1')
        const filepath = path.join(project.path, fileName)
        await vscode.window.showTextDocument(vscode.Uri.parse(filepath))
        const zipMetadata = await zipUtil.zipProject(
            [...(vscode.workspace.workspaceFolders ?? [])] as CurrentWsFolders,
            defaultExcludePatterns,
            {
                includeNonWorkspaceFiles: true,
            }
        )

        assert.strictEqual(zipMetadata.scannedFiles.has(path.join(project.path, fileName)), true)
    })

    it('throws on empty project', async function () {
        const project = await TestFolder.create()
        await assert.rejects(
            async () =>
                await zipUtil.zipProject(
                    [{ uri: vscode.Uri.file(project.path), name: 'project1', index: 0 }] as CurrentWsFolders,
                    defaultExcludePatterns
                ),
            new NoSourceFilesError()
        )
    })
})
