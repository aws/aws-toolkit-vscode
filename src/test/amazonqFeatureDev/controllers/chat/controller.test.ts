/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import sinon from 'sinon'
import { waitUntil } from '../../../../shared/utilities/timeoutUtils'
import { ControllerSetup, createController } from '../../utils'
import { ChatControllerEventEmitters } from '../../../../amazonqFeatureDev/controllers/chat/controller'
import { FollowUpTypes, createUri } from '../../../../amazonqFeatureDev/types'
import { Session } from '../../../../amazonqFeatureDev/session/session'
import { Prompter } from '../../../../shared/ui/prompter'
import { toFile } from '../../../testUtil'
import { SelectedFolderNotInWorkspaceFolderError } from '../../../../amazonqFeatureDev/errors'

describe('Controller', () => {
    const tabID = '123'
    const conversationID = '456'
    const uploadID = '789'

    let controllerSetup: ControllerSetup

    beforeEach(async () => {
        controllerSetup = await createController({
            conversationID,
            tabID,
            uploadID,
        })
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('openDiff', async () => {
        async function openDiff(
            controllerEventEmitter: ChatControllerEventEmitters,
            filePath: string,
            deleted = false
        ) {
            const executeDiff = sinon.stub(vscode.commands, 'executeCommand').returns(Promise.resolve(undefined))
            controllerEventEmitter.openDiff.fire({ tabID, filePath, deleted })

            // Wait until the controller has time to process the event
            await waitUntil(() => {
                return Promise.resolve(executeDiff.callCount > 0)
            }, {})

            return executeDiff
        }

        it('uses empty file when file is not found locally', async () => {
            const executedDiff = await openDiff(controllerSetup.emitters, path.join('src', 'mynewfile.js'))
            assert.strictEqual(
                executedDiff.calledWith(
                    'vscode.diff',
                    createUri('empty', tabID),
                    createUri(path.join(uploadID, 'src', 'mynewfile.js'), tabID)
                ),
                true
            )
        })

        it('uses file location when file is found locally and /src is not available', async () => {
            const newFileLocation = path.join(controllerSetup.workspaceFolder.uri.fsPath, 'mynewfile.js')
            toFile('', newFileLocation)
            const executedDiff = await openDiff(controllerSetup.emitters, 'mynewfile.js')
            assert.strictEqual(
                executedDiff.calledWith(
                    'vscode.diff',
                    vscode.Uri.file(newFileLocation),
                    createUri(path.join(uploadID, 'mynewfile.js'), tabID)
                ),
                true
            )
        })

        it('uses file location when file is found locally and /src is available', async () => {
            const newFileLocation = path.join(controllerSetup.workspaceFolder.uri.fsPath, 'src', 'mynewfile.js')
            toFile('', newFileLocation)
            const executedDiff = await openDiff(controllerSetup.emitters, path.join('src', 'mynewfile.js'))
            assert.strictEqual(
                executedDiff.calledWith(
                    'vscode.diff',
                    vscode.Uri.file(newFileLocation),
                    createUri(path.join(uploadID, 'src', 'mynewfile.js'), tabID)
                ),
                true
            )
        })

        it('uses file location when file is found locally and source folder was picked', async () => {
            const newFileLocation = path.join(controllerSetup.workspaceFolder.uri.fsPath, 'foo', 'fi', 'mynewfile.js')
            toFile('', newFileLocation)
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(controllerSetup.workspaceFolder)
            controllerSetup.session.config.sourceRoot = path.join(
                controllerSetup.workspaceFolder.uri.fsPath,
                'foo',
                'fi'
            )
            const executedDiff = await openDiff(controllerSetup.emitters, path.join('foo', 'fi', 'mynewfile.js'))
            assert.strictEqual(
                executedDiff.calledWith(
                    'vscode.diff',
                    vscode.Uri.file(newFileLocation),
                    createUri(path.join(uploadID, 'foo', 'fi', 'mynewfile.js'), tabID)
                ),
                true
            )
        })
    })

    describe('modifyDefaultSourceFolder', () => {
        async function modifyDefaultSourceFolder(
            controllerEventEmitter: ChatControllerEventEmitters,
            session: Session,
            sourceRoot: string
        ) {
            const promptStub = sinon.stub(Prompter.prototype, 'prompt').resolves(vscode.Uri.file(sourceRoot))
            controllerEventEmitter.followUpClicked.fire({
                tabID,
                followUp: {
                    type: FollowUpTypes.ModifyDefaultSourceFolder,
                },
            })

            // Wait until the controller has time to process the event
            await waitUntil(() => {
                return Promise.resolve(promptStub.callCount > 0)
            }, {})

            return session
        }

        it('fails if selected folder is not under a workspace folder', async () => {
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(undefined)
            const messengerSpy = sinon.spy(controllerSetup.messenger, 'sendAnswer')
            await modifyDefaultSourceFolder(controllerSetup.emitters, controllerSetup.session, '../../')
            assert.deepStrictEqual(
                messengerSpy.calledWith({
                    tabID,
                    type: 'answer',
                    message: new SelectedFolderNotInWorkspaceFolderError().message,
                }),
                true
            )
            assert.deepStrictEqual(
                messengerSpy.calledWith({
                    tabID,
                    type: 'system-prompt',
                    followUps: sinon.match.any,
                }),
                true
            )
        })

        it('accepts valid source folders under a workspace root', async () => {
            const controllerSetup = await createController({
                conversationID,
                tabID,
                uploadID,
            })
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(controllerSetup.workspaceFolder)
            const expectedSourceRoot = path.join(controllerSetup.workspaceFolder.uri.fsPath, 'src')
            const modifiedSourceFolderSession = await modifyDefaultSourceFolder(
                controllerSetup.emitters,
                controllerSetup.session,
                expectedSourceRoot
            )
            assert.strictEqual(modifiedSourceFolderSession.config.sourceRoot, expectedSourceRoot)
            assert.strictEqual(
                modifiedSourceFolderSession.config.workspaceRoot,
                controllerSetup.workspaceFolder.uri.fsPath
            )
        })
    })
})
