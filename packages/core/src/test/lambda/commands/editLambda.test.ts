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
    openLambdaFolderForEdit,
} from '../../../lambda/commands/editLambda'
import { LambdaFunction } from '../../../lambda/commands/uploadLambda'
import * as downloadLambda from '../../../lambda/commands/downloadLambda'
import * as uploadLambda from '../../../lambda/commands/uploadLambda'
import * as utils from '../../../lambda/utils'
import * as messages from '../../../shared/utilities/messages'
import fs from '../../../shared/fs/fs'
import { LambdaFunctionNodeDecorationProvider } from '../../../lambda/explorer/lambdaFunctionNodeDecorationProvider'
import path from 'path'

describe('editLambda', function () {
    let mockLambda: LambdaFunction
    let mockTemp: string
    let mockUri: vscode.Uri

    // Stub variables
    let getFunctionInfoStub: sinon.SinonStub
    let setFunctionInfoStub: sinon.SinonStub
    let compareCodeShaStub: sinon.SinonStub
    let downloadLambdaStub: sinon.SinonStub
    let openLambdaFileStub: sinon.SinonStub
    let runUploadDirectoryStub: sinon.SinonStub
    let showConfirmationMessageStub: sinon.SinonStub
    let createFileSystemWatcherStub: sinon.SinonStub
    let executeCommandStub: sinon.SinonStub
    let existsDirStub: sinon.SinonStub
    let mkdirStub: sinon.SinonStub
    let promptDeployStub: sinon.SinonStub
    let readdirStub: sinon.SinonStub

    beforeEach(function () {
        mockLambda = {
            name: 'test-function',
            region: 'us-east-1',
            configuration: {
                FunctionName: 'test-function',
                CodeSha256: 'test-sha',
                Runtime: 'nodejs18.x',
            },
        }
        mockTemp = utils.getTempLocation(mockLambda.name, mockLambda.region)
        mockUri = vscode.Uri.file(mockTemp)

        // Create stubs
        getFunctionInfoStub = sinon.stub(utils, 'getFunctionInfo').resolves(undefined)
        setFunctionInfoStub = sinon.stub(utils, 'setFunctionInfo').resolves()
        compareCodeShaStub = sinon.stub(utils, 'compareCodeSha').resolves(true)
        downloadLambdaStub = sinon.stub(downloadLambda, 'downloadLambdaInLocation').resolves()
        openLambdaFileStub = sinon.stub(downloadLambda, 'openLambdaFile').resolves()
        runUploadDirectoryStub = sinon.stub(uploadLambda, 'runUploadDirectory').resolves()
        showConfirmationMessageStub = sinon.stub(messages, 'showConfirmationMessage').resolves(true)
        createFileSystemWatcherStub = sinon.stub(vscode.workspace, 'createFileSystemWatcher').returns({
            onDidChange: sinon.stub(),
            onDidCreate: sinon.stub(),
            onDidDelete: sinon.stub(),
            dispose: sinon.stub(),
        } as any)
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves()
        existsDirStub = sinon.stub(fs, 'existsDir').resolves(true)
        mkdirStub = sinon.stub(fs, 'mkdir').resolves()
        readdirStub = sinon.stub(fs, 'readdir').resolves([['file', vscode.FileType.File]])
        promptDeployStub = sinon.stub().resolves(true)
        sinon.replace(require('../../../lambda/commands/editLambda'), 'promptDeploy', promptDeployStub)

        // Other stubs
        sinon.stub(utils, 'getLambdaDetails').returns({ fileName: 'index.js', functionName: 'test-function' })
        sinon.stub(fs, 'delete').resolves()
        sinon.stub(fs, 'stat').resolves({ ctime: Date.now() } as any)
        sinon.stub(vscode.workspace, 'saveAll').resolves(true)
        sinon.stub(LambdaFunctionNodeDecorationProvider.prototype, 'addBadge').resolves()
        sinon.stub(LambdaFunctionNodeDecorationProvider.prototype, 'removeBadge').resolves()
        sinon.stub(LambdaFunctionNodeDecorationProvider, 'getInstance').returns({
            addBadge: sinon.stub().resolves(),
            removeBadge: sinon.stub().resolves(),
        } as any)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('editLambda', function () {
        it('returns early if folder already exists in workspace', async function () {
            sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: vscode.Uri.file(mockTemp) }])

            const result = await editLambda(mockLambda)

            assert.strictEqual(result, mockTemp)
        })

        it('downloads lambda when no local code exists', async function () {
            await editLambda(mockLambda)

            assert(downloadLambdaStub.calledOnce)
        })

        it('prompts for overwrite when local code differs from remote', async function () {
            getFunctionInfoStub.resolves('old-sha')
            compareCodeShaStub.resolves(false)

            await editLambda(mockLambda)

            assert(showConfirmationMessageStub.calledOnce)
        })

        it('opens existing file when user declines overwrite', async function () {
            getFunctionInfoStub.resolves('old-sha')
            compareCodeShaStub.resolves(false)
            showConfirmationMessageStub.resolves(false)

            await editLambda(mockLambda)

            assert(openLambdaFileStub.calledOnce)
        })

        it('downloads lambda when directory exists but is empty', async function () {
            getFunctionInfoStub.resolves('old-sha')
            readdirStub.resolves([])

            await editLambda(mockLambda)

            assert(downloadLambdaStub.calledOnce)
            assert(showConfirmationMessageStub.notCalled)
        })

        it('downloads lambda when directory does not exist', async function () {
            getFunctionInfoStub.resolves('old-sha')
            existsDirStub.resolves(false)

            await editLambda(mockLambda)

            assert(downloadLambdaStub.calledOnce)
            assert(showConfirmationMessageStub.notCalled)
        })

        it('sets up file watcher after download', async function () {
            const watcherStub = {
                onDidChange: sinon.stub(),
                onDidCreate: sinon.stub(),
                onDidDelete: sinon.stub(),
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
                onDidChange: sinon.stub(),
                onDidCreate: sinon.stub(),
                onDidDelete: sinon.stub(),
            }
            createFileSystemWatcherStub.returns(watcher)

            watchForUpdates(mockLambda, mockUri)

            assert(createFileSystemWatcherStub.calledOnce)
            const pattern = createFileSystemWatcherStub.firstCall.args[0]
            assert(pattern instanceof vscode.RelativePattern)
        })

        it('sets up change, create, and delete handlers', function () {
            const watcher = {
                onDidChange: sinon.stub(),
                onDidCreate: sinon.stub(),
                onDidDelete: sinon.stub(),
            }
            createFileSystemWatcherStub.returns(watcher)

            watchForUpdates(mockLambda, mockUri)

            assert(watcher.onDidChange.calledOnce)
            assert(watcher.onDidCreate.calledOnce)
            assert(watcher.onDidDelete.calledOnce)
        })
    })

    describe('promptForSync', function () {
        it('returns early if directory does not exist', async function () {
            existsDirStub.resolves(false)

            await promptForSync(mockLambda, mockUri, vscode.Uri.file('/test/file.js'))

            assert(setFunctionInfoStub.notCalled)
        })
    })

    describe('deployFromTemp', function () {
        it('uploads without confirmation when code is up to date', async function () {
            await deployFromTemp(mockLambda, mockUri)

            assert(showConfirmationMessageStub.notCalled)
            assert(runUploadDirectoryStub.calledOnce)
        })

        it('prompts for confirmation when code is outdated', async function () {
            compareCodeShaStub.resolves(false)

            await deployFromTemp(mockLambda, mockUri)

            assert(showConfirmationMessageStub.calledOnce)
        })

        it('does not upload when user declines overwrite', async function () {
            compareCodeShaStub.resolves(false)
            showConfirmationMessageStub.resolves(false)

            await deployFromTemp(mockLambda, mockUri)

            assert(runUploadDirectoryStub.notCalled)
        })

        it('updates function info after successful upload', async function () {
            await deployFromTemp(mockLambda, mockUri)

            assert(runUploadDirectoryStub.calledOnce)
            assert(
                setFunctionInfoStub.calledWith(mockLambda, {
                    lastDeployed: sinon.match.number,
                    undeployed: false,
                })
            )
        })
    })

    describe('openLambdaFolderForEdit', function () {
        it('focuses existing workspace folder if already open', async function () {
            const subfolderPath = path.normalize(path.join(mockTemp, 'subfolder'))
            sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: vscode.Uri.file(subfolderPath) }])

            await openLambdaFolderForEdit('test-function', 'us-east-1')

            assert(executeCommandStub.calledWith('workbench.action.focusSideBar'))
            assert(executeCommandStub.calledWith('workbench.view.explorer'))
        })

        it('opens new folder when not in workspace', async function () {
            sinon.stub(vscode.workspace, 'workspaceFolders').value([])

            await openLambdaFolderForEdit('test-function', 'us-east-1')

            assert(mkdirStub.calledOnce)
            assert(
                executeCommandStub.calledWith('vscode.openFolder', sinon.match.any, {
                    newWindow: true,
                    noRecentEntry: true,
                })
            )
        })
    })
})
