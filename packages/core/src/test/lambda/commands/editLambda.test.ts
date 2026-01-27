/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import * as sinon from 'sinon'
import {
    editLambda,
    watchForUpdates,
    promptForSync,
    deployFromTemp,
    getReadme,
    deleteFilesInFolder,
    overwriteChangesForEdit,
} from '../../../lambda/commands/editLambda'
import { LambdaFunction } from '../../../lambda/commands/uploadLambda'
import * as downloadLambda from '../../../lambda/commands/downloadLambda'
import * as uploadLambda from '../../../lambda/commands/uploadLambda'
import * as utils from '../../../lambda/utils'
import * as messages from '../../../shared/utilities/messages'
import fs from '../../../shared/fs/fs'
import { LambdaFunctionNodeDecorationProvider } from '../../../lambda/explorer/lambdaFunctionNodeDecorationProvider'
import path from 'path'
import globals from '../../../shared/extensionGlobals'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe('editLambda', function () {
    let sandbox: sinon.SinonSandbox
    let mockLambda: LambdaFunction
    let tempFolder: string
    let downloadLocation: string

    // Stub variables for external dependencies (not filesystem)
    let getFunctionInfoStub: sinon.SinonStub
    let setFunctionInfoStub: sinon.SinonStub
    let compareCodeShaStub: sinon.SinonStub
    let downloadLambdaStub: sinon.SinonStub
    let openLambdaFileStub: sinon.SinonStub
    let runUploadDirectoryStub: sinon.SinonStub
    let showConfirmationMessageStub: sinon.SinonStub
    let createFileSystemWatcherStub: sinon.SinonStub
    let promptDeployStub: sinon.SinonStub

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        tempFolder = await makeTemporaryToolkitFolder()
        downloadLocation = path.join(tempFolder, 'test-function')

        mockLambda = {
            name: 'test-function',
            region: 'us-east-1',
            configuration: {
                FunctionName: 'test-function',
                CodeSha256: 'test-sha',
                Runtime: 'nodejs18.x',
            },
        }

        // Stub getTempLocation to return our test folder
        sandbox.stub(utils, 'getTempLocation').returns(downloadLocation)

        // Create stubs for external dependencies (not filesystem)
        getFunctionInfoStub = sandbox.stub(utils, 'getFunctionInfo').resolves(undefined)
        setFunctionInfoStub = sandbox.stub(utils, 'setFunctionInfo').resolves()
        compareCodeShaStub = sandbox.stub(utils, 'compareCodeSha').resolves(true)
        downloadLambdaStub = sandbox.stub(downloadLambda, 'downloadLambdaInLocation').resolves()
        openLambdaFileStub = sandbox.stub(downloadLambda, 'openLambdaFile').resolves()
        runUploadDirectoryStub = sandbox.stub(uploadLambda, 'runUploadDirectory').resolves()
        showConfirmationMessageStub = sandbox.stub(messages, 'showConfirmationMessage').resolves(true)
        createFileSystemWatcherStub = sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns({
            onDidChange: sandbox.stub(),
            onDidCreate: sandbox.stub(),
            onDidDelete: sandbox.stub(),
            dispose: sandbox.stub(),
        } as any)
        promptDeployStub = sandbox.stub().resolves(true)
        sandbox.replace(require('../../../lambda/commands/editLambda'), 'promptDeploy', promptDeployStub)

        // Other stubs for external dependencies
        sandbox.stub(utils, 'getLambdaDetails').returns({ fileName: 'index.js', functionName: 'test-function' })
        sandbox.stub(vscode.workspace, 'saveAll').resolves(true)
        sandbox.stub(LambdaFunctionNodeDecorationProvider.prototype, 'addBadge').resolves()
        sandbox.stub(LambdaFunctionNodeDecorationProvider.prototype, 'removeBadge').resolves()
        sandbox.stub(LambdaFunctionNodeDecorationProvider, 'getInstance').returns({
            addBadge: sandbox.stub().resolves(),
            removeBadge: sandbox.stub().resolves(),
        } as any)
    })

    afterEach(async function () {
        sandbox.restore()
        // Clean up temp folder
        await fs.delete(tempFolder, { recursive: true, force: true })
    })

    describe('editLambda', function () {
        it('returns early if folder already exists in workspace', async function () {
            sandbox.stub(vscode.workspace, 'workspaceFolders').value([{ uri: vscode.Uri.file(downloadLocation) }])

            const result = await editLambda(mockLambda)

            assert.strictEqual(result, downloadLocation)
        })

        it('downloads lambda when no local code exists (directory does not exist)', async function () {
            // Directory doesn't exist - real filesystem state
            await editLambda(mockLambda)

            assert(downloadLambdaStub.calledOnce)
        })

        it('downloads lambda when directory exists but is empty', async function () {
            // Create empty directory - real filesystem state
            await fs.mkdir(downloadLocation)

            getFunctionInfoStub.resolves('old-sha')

            await editLambda(mockLambda)

            assert(downloadLambdaStub.calledOnce)
            assert(showConfirmationMessageStub.notCalled)
        })

        it('prompts for overwrite when local code differs from remote', async function () {
            // Create directory with files - real filesystem state
            await fs.mkdir(downloadLocation)
            await fs.writeFile(path.join(downloadLocation, 'index.js'), 'exports.handler = () => {}')

            getFunctionInfoStub.resolves('old-sha')
            compareCodeShaStub.resolves(false)

            await editLambda(mockLambda)

            assert(showConfirmationMessageStub.calledOnce)
        })

        it('opens existing file when user declines overwrite', async function () {
            // Create directory with files - real filesystem state
            await fs.mkdir(downloadLocation)
            await fs.writeFile(path.join(downloadLocation, 'index.js'), 'exports.handler = () => {}')

            getFunctionInfoStub.resolves('old-sha')
            compareCodeShaStub.resolves(false)
            showConfirmationMessageStub.resolves(false)

            // Specify that it's from the explorer because otherwise there's no need to open
            await editLambda(mockLambda, 'explorer')

            assert(openLambdaFileStub.calledOnce)
        })

        it('sets up file watcher after download', async function () {
            const watcherStub = {
                onDidChange: sandbox.stub(),
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
            }
            createFileSystemWatcherStub.returns(watcherStub)

            await editLambda(mockLambda)

            assert(watcherStub.onDidChange.calledOnce)
            assert(watcherStub.onDidCreate.calledOnce)
            assert(watcherStub.onDidDelete.calledOnce)
        })
    })

    describe('watchForUpdates', function () {
        it('creates file system watcher with correct pattern', function () {
            const watcher = {
                onDidChange: sandbox.stub(),
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
            }
            createFileSystemWatcherStub.returns(watcher)

            watchForUpdates(mockLambda, vscode.Uri.file(downloadLocation))

            assert(createFileSystemWatcherStub.calledOnce)
            const pattern = createFileSystemWatcherStub.firstCall.args[0]
            assert(pattern instanceof vscode.RelativePattern)
        })

        it('sets up change, create, and delete handlers', function () {
            const watcher = {
                onDidChange: sandbox.stub(),
                onDidCreate: sandbox.stub(),
                onDidDelete: sandbox.stub(),
            }
            createFileSystemWatcherStub.returns(watcher)

            watchForUpdates(mockLambda, vscode.Uri.file(downloadLocation))

            assert(watcher.onDidChange.calledOnce)
            assert(watcher.onDidCreate.calledOnce)
            assert(watcher.onDidDelete.calledOnce)
        })
    })

    describe('promptForSync', function () {
        it('returns early if directory does not exist', async function () {
            // Use real filesystem - directory doesn't exist
            const nonExistentUri = vscode.Uri.file(path.join(tempFolder, 'non-existent'))

            await promptForSync(mockLambda, nonExistentUri, vscode.Uri.file('/test/file.js'))

            assert(setFunctionInfoStub.notCalled)
        })
    })

    describe('deployFromTemp', function () {
        it('uploads without confirmation when code is up to date', async function () {
            await deployFromTemp(mockLambda, vscode.Uri.file(downloadLocation))

            assert(showConfirmationMessageStub.notCalled)
            assert(runUploadDirectoryStub.calledOnce)
        })

        it('prompts for confirmation when code is outdated', async function () {
            compareCodeShaStub.resolves(false)

            await deployFromTemp(mockLambda, vscode.Uri.file(downloadLocation))

            assert(showConfirmationMessageStub.calledOnce)
        })

        it('does not upload when user declines overwrite', async function () {
            compareCodeShaStub.resolves(false)
            showConfirmationMessageStub.resolves(false)

            await deployFromTemp(mockLambda, vscode.Uri.file(downloadLocation))

            assert(runUploadDirectoryStub.notCalled)
        })

        it('updates function info after successful upload', async function () {
            await deployFromTemp(mockLambda, vscode.Uri.file(downloadLocation))

            assert(runUploadDirectoryStub.calledOnce)
            assert(
                setFunctionInfoStub.calledWith(mockLambda, {
                    lastDeployed: sinon.match.number,
                    undeployed: false,
                })
            )
        })
    })

    describe('deleteFilesInFolder', function () {
        it('deletes all files in the specified folder', async function () {
            // Create real test files
            const testDir = path.join(tempFolder, 'test-delete')
            await fs.mkdir(testDir)
            await fs.writeFile(path.join(testDir, 'file1.js'), 'content1')
            await fs.writeFile(path.join(testDir, 'file2.js'), 'content2')

            // Verify files exist
            assert.strictEqual(await fs.exists(path.join(testDir, 'file1.js')), true)
            assert.strictEqual(await fs.exists(path.join(testDir, 'file2.js')), true)

            await deleteFilesInFolder(testDir)

            // Verify files are deleted
            assert.strictEqual(await fs.exists(path.join(testDir, 'file1.js')), false)
            assert.strictEqual(await fs.exists(path.join(testDir, 'file2.js')), false)
        })

        it('deletes nested directories recursively', async function () {
            // Create nested directory structure
            const testDir = path.join(tempFolder, 'test-nested')
            const nestedDir = path.join(testDir, 'nested')
            await fs.mkdir(testDir)
            await fs.mkdir(nestedDir)
            await fs.writeFile(path.join(testDir, 'file1.js'), 'content1')
            await fs.writeFile(path.join(nestedDir, 'file2.js'), 'content2')

            // Verify files exist
            assert.strictEqual(await fs.exists(path.join(testDir, 'file1.js')), true)
            assert.strictEqual(await fs.exists(path.join(nestedDir, 'file2.js')), true)

            await deleteFilesInFolder(testDir)

            // Verify all contents are deleted
            assert.strictEqual(await fs.exists(path.join(testDir, 'file1.js')), false)
            assert.strictEqual(await fs.exists(nestedDir), false)
        })
    })

    describe('overwriteChangesForEdit', function () {
        it('clears directory and downloads lambda code when directory exists', async function () {
            // Create directory with existing files - real filesystem state
            await fs.mkdir(downloadLocation)
            await fs.writeFile(path.join(downloadLocation, 'old-file.js'), 'old content')

            await overwriteChangesForEdit(mockLambda, downloadLocation)

            // Verify old file was deleted
            assert.strictEqual(await fs.exists(path.join(downloadLocation, 'old-file.js')), false)
            // Verify download was called
            assert(downloadLambdaStub.calledWith(mockLambda, 'local', downloadLocation))
            assert(setFunctionInfoStub.calledWith(mockLambda, sinon.match.object))
        })

        it('creates directory if it does not exist', async function () {
            // Directory doesn't exist - real filesystem state
            assert.strictEqual(await fs.existsDir(downloadLocation), false)

            await overwriteChangesForEdit(mockLambda, downloadLocation)

            // Verify directory was created
            assert.strictEqual(await fs.existsDir(downloadLocation), true)
            // Verify download was called
            assert(downloadLambdaStub.calledWith(mockLambda, 'local', downloadLocation))
        })
    })

    describe('getReadme', function () {
        beforeEach(async function () {
            // Create a temp directory for lambdaTempPath
            const readmeTempDir = path.join(tempFolder, 'lambda-temp')
            await fs.mkdir(readmeTempDir)

            // Create mock source files
            const resourcesDir = path.join(tempFolder, 'resources')
            const markdownDir = path.join(resourcesDir, 'markdown')
            const iconsDir = path.join(resourcesDir, 'icons', 'aws', 'lambda')
            const vscodeIconsDir = path.join(resourcesDir, 'icons', 'vscode', 'light')

            await fs.mkdir(markdownDir)
            await fs.mkdir(iconsDir)
            await fs.mkdir(vscodeIconsDir)

            await fs.writeFile(path.join(markdownDir, 'lambdaEdit.md'), '# Lambda Edit README')
            await fs.writeFile(path.join(iconsDir, 'create-stack-light.svg'), '<svg></svg>')
            await fs.writeFile(path.join(vscodeIconsDir, 'run.svg'), '<svg></svg>')
            await fs.writeFile(path.join(vscodeIconsDir, 'cloud-upload.svg'), '<svg></svg>')

            sandbox.stub(globals.context, 'asAbsolutePath').callsFake((p) => path.join(tempFolder, p))

            // Stub lambdaTempPath to use our test directory
            sandbox.stub(utils, 'lambdaTempPath').value(readmeTempDir)
        })

        it('reads markdown file and writes README.md to temp path', async function () {
            const readmeTempDir = path.join(tempFolder, 'lambda-temp')
            const result = await getReadme()

            // Verify README was written
            assert.strictEqual(await fs.exists(path.join(readmeTempDir, 'README.md')), true)
            const content = await fs.readFileText(path.join(readmeTempDir, 'README.md'))
            assert.strictEqual(content, '# Lambda Edit README')
            assert.strictEqual(result, path.join(readmeTempDir, 'README.md'))
        })

        it('copies all required icon files', async function () {
            const readmeTempDir = path.join(tempFolder, 'lambda-temp')
            await getReadme()

            // Verify icons were copied
            assert.strictEqual(await fs.exists(path.join(readmeTempDir, 'create-stack.svg')), true)
            assert.strictEqual(await fs.exists(path.join(readmeTempDir, 'invoke.svg')), true)
            assert.strictEqual(await fs.exists(path.join(readmeTempDir, 'deploy.svg')), true)
        })
    })
})
