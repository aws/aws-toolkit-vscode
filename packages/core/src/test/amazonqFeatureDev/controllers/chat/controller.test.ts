/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import sinon from 'sinon'
import { waitUntil } from '../../../../shared/utilities/timeoutUtils'
import { ControllerSetup, createController, createSession, generateVirtualMemoryUri } from '../../utils'
import {
    CurrentWsFolders,
    FollowUpTypes,
    createUri,
    NewFileInfo,
    DeletedFileInfo,
} from '../../../../amazonqFeatureDev/types'
import { Session } from '../../../../amazonqFeatureDev/session/session'
import { Prompter } from '../../../../shared/ui/prompter'
import { assertTelemetry, toFile } from '../../../testUtil'
import { SelectedFolderNotInWorkspaceFolderError } from '../../../../amazonqFeatureDev/errors'
import {
    CodeGenState,
    PrepareCodeGenState,
    PrepareRefinementState,
} from '../../../../amazonqFeatureDev/session/sessionState'
import { FeatureDevClient } from '../../../../amazonqFeatureDev/client/featureDev'

let mockGetCodeGeneration: sinon.SinonStub
describe('Controller', () => {
    const tabID = '123'
    const conversationID = '456'
    const uploadID = '789'

    let session: Session
    let controllerSetup: ControllerSetup

    const getFilePaths = (controllerSetup: ControllerSetup): NewFileInfo[] => [
        {
            zipFilePath: 'myfile1.js',
            relativePath: 'myfile1.js',
            fileContent: '',
            rejected: false,
            virtualMemoryUri: generateVirtualMemoryUri(uploadID, 'myfile1.js'),
            workspaceFolder: controllerSetup.workspaceFolder,
        },
        {
            zipFilePath: 'myfile2.js',
            relativePath: 'myfile2.js',
            fileContent: '',
            rejected: true,
            virtualMemoryUri: generateVirtualMemoryUri(uploadID, 'myfile2.js'),
            workspaceFolder: controllerSetup.workspaceFolder,
        },
    ]

    const getDeletedFiles = (): DeletedFileInfo[] => [
        {
            zipFilePath: 'myfile3.js',
            relativePath: 'myfile3.js',
            rejected: false,
            workspaceFolder: controllerSetup.workspaceFolder,
        },
        {
            zipFilePath: 'myfile4.js',
            relativePath: 'myfile4.js',
            rejected: true,
            workspaceFolder: controllerSetup.workspaceFolder,
        },
    ]

    before(() => {
        sinon.stub(performance, 'now').returns(0)
    })

    beforeEach(async () => {
        controllerSetup = await createController()
        session = await createSession({ messenger: controllerSetup.messenger, conversationID, tabID, uploadID })
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('openDiff', async () => {
        async function openDiff(filePath: string, deleted = false) {
            const executeDiff = sinon.stub(vscode.commands, 'executeCommand').returns(Promise.resolve(undefined))
            controllerSetup.emitters.openDiff.fire({ tabID, conversationID, filePath, deleted })

            // Wait until the controller has time to process the event
            await waitUntil(() => {
                return Promise.resolve(executeDiff.callCount > 0)
            }, {})

            return executeDiff
        }

        it('uses empty file when file is not found locally', async () => {
            sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
            const executedDiff = await openDiff(path.join('src', 'mynewfile.js'))
            assert.strictEqual(
                executedDiff.calledWith(
                    'vscode.diff',
                    createUri('empty', tabID),
                    createUri(path.join(uploadID, 'src', 'mynewfile.js'), tabID)
                ),
                true
            )

            assertTelemetry('amazonq_isReviewedChanges', { amazonqConversationId: conversationID, enabled: true })
        })

        it('uses file location when file is found locally and /src is not available', async () => {
            sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
            const newFileLocation = path.join(controllerSetup.workspaceFolder.uri.fsPath, 'mynewfile.js')
            await toFile('', newFileLocation)
            const executedDiff = await openDiff('mynewfile.js')
            assert.strictEqual(
                executedDiff.calledWith(
                    'vscode.diff',
                    vscode.Uri.file(newFileLocation),
                    createUri(path.join(uploadID, 'mynewfile.js'), tabID)
                ),
                true
            )

            assertTelemetry('amazonq_isReviewedChanges', { amazonqConversationId: conversationID, enabled: true })
        })

        it('uses file location when file is found locally and /src is available', async () => {
            sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
            const newFileLocation = path.join(controllerSetup.workspaceFolder.uri.fsPath, 'src', 'mynewfile.js')
            await toFile('', newFileLocation)
            const executedDiff = await openDiff(path.join('src', 'mynewfile.js'))
            assert.strictEqual(
                executedDiff.calledWith(
                    'vscode.diff',
                    vscode.Uri.file(newFileLocation),
                    createUri(path.join(uploadID, 'src', 'mynewfile.js'), tabID)
                ),
                true
            )

            assertTelemetry('amazonq_isReviewedChanges', { amazonqConversationId: conversationID, enabled: true })
        })

        it('uses file location when file is found locally and source folder was picked', async () => {
            sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
            const newFileLocation = path.join(controllerSetup.workspaceFolder.uri.fsPath, 'foo', 'fi', 'mynewfile.js')
            await toFile('', newFileLocation)
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(controllerSetup.workspaceFolder)
            session.config.workspaceRoots = [path.join(controllerSetup.workspaceFolder.uri.fsPath, 'foo', 'fi')]
            const executedDiff = await openDiff(path.join('foo', 'fi', 'mynewfile.js'))
            assert.strictEqual(
                executedDiff.calledWith(
                    'vscode.diff',
                    vscode.Uri.file(newFileLocation),
                    createUri(path.join(uploadID, 'foo', 'fi', 'mynewfile.js'), tabID)
                ),
                true
            )

            assertTelemetry('amazonq_isReviewedChanges', { amazonqConversationId: conversationID, enabled: true })
        })
    })

    describe('modifyDefaultSourceFolder', () => {
        async function modifyDefaultSourceFolder(sourceRoot: string) {
            const promptStub = sinon.stub(Prompter.prototype, 'prompt').resolves(vscode.Uri.file(sourceRoot))
            controllerSetup.emitters.followUpClicked.fire({
                tabID,
                followUp: {
                    type: FollowUpTypes.ModifyDefaultSourceFolder,
                },
            })

            // Wait until the controller has time to process the event
            await waitUntil(() => {
                return Promise.resolve(promptStub.callCount > 0)
            }, {})

            return controllerSetup.sessionStorage.getSession(tabID)
        }

        it('fails if selected folder is not under a workspace folder', async () => {
            sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(undefined)
            const messengerSpy = sinon.spy(controllerSetup.messenger, 'sendAnswer')
            await modifyDefaultSourceFolder('../../')
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
            const controllerSetup = await createController()
            sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(controllerSetup.workspaceFolder)
            const expectedSourceRoot = path.join(controllerSetup.workspaceFolder.uri.fsPath, 'src')
            const modifiedSession = await modifyDefaultSourceFolder(expectedSourceRoot)
            assert.strictEqual(modifiedSession.config.workspaceRoots.length, 1)
            assert.strictEqual(modifiedSession.config.workspaceRoots[0], expectedSourceRoot)
        })
    })

    describe('processChatItemVotedMessage', () => {
        async function processChatItemVotedMessage(vote: 'upvote' | 'downvote') {
            const initialState = new PrepareRefinementState(
                {
                    conversationId: conversationID,
                    proxyClient: new FeatureDevClient(),
                    workspaceRoots: [''],
                    workspaceFolders: [controllerSetup.workspaceFolder],
                },
                '',
                tabID
            )
            const newSession = await createSession({
                messenger: controllerSetup.messenger,
                sessionState: initialState,
                conversationID,
                tabID,
                uploadID,
            })
            const getSessionStub = sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(newSession)
            controllerSetup.emitters.processChatItemVotedMessage.fire({
                tabID,
                messageID: '',
                vote,
            })

            // Wait until the controller has time to process the event
            await waitUntil(() => {
                return Promise.resolve(getSessionStub.callCount > 0)
            }, {})
        }

        it('incoming upvoted message sends telemetry', async () => {
            await processChatItemVotedMessage('upvote')

            assertTelemetry('amazonq_approachThumbsUp', { amazonqConversationId: conversationID, result: 'Succeeded' })
        })

        it('incoming downvoted message sends telemetry', async () => {
            await processChatItemVotedMessage('downvote')

            assertTelemetry('amazonq_approachThumbsDown', {
                amazonqConversationId: conversationID,
                result: 'Succeeded',
            })
        })
    })

    describe('newTask', () => {
        async function newTaskClicked() {
            const getSessionStub = sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)

            controllerSetup.emitters.followUpClicked.fire({
                tabID,
                followUp: {
                    type: FollowUpTypes.NewTask,
                },
            })

            // Wait until the controller has time to process the event
            await waitUntil(() => {
                return Promise.resolve(getSessionStub.callCount > 0)
            }, {})
        }

        it('end chat telemetry is sent', async () => {
            await newTaskClicked()

            assertTelemetry('amazonq_endChat', { amazonqConversationId: conversationID, result: 'Succeeded' })
        })
    })

    describe('fileClicked', () => {
        async function createCodeGenState() {
            mockGetCodeGeneration = sinon.stub().resolves({ codeGenerationStatus: { status: 'Complete' } })

            const workspaceFolders = [controllerSetup.workspaceFolder] as CurrentWsFolders
            const testConfig = {
                conversationId: conversationID,
                proxyClient: {
                    createConversation: () => sinon.stub(),
                    createUploadUrl: () => sinon.stub(),
                    generatePlan: () => sinon.stub(),
                    startCodeGeneration: () => sinon.stub(),
                    getCodeGeneration: () => mockGetCodeGeneration(),
                    exportResultArchive: () => sinon.stub(),
                } as unknown as FeatureDevClient,
                workspaceRoots: [''],
                uploadId: uploadID,
                workspaceFolders,
            }
            const testApproach = 'test-approach'

            const codeGenState = new CodeGenState(
                testConfig,
                testApproach,
                getFilePaths(controllerSetup),
                [],
                [],
                tabID,
                0
            )
            const newSession = await createSession({
                messenger: controllerSetup.messenger,
                sessionState: codeGenState,
                conversationID,
                tabID,
                uploadID,
            })
            return newSession
        }

        async function fileClicked(
            getSessionStub: sinon.SinonStub<[tabID: string], Promise<Session>>,
            action: string,
            filePath: string
        ) {
            controllerSetup.emitters.fileClicked.fire({
                tabID,
                conversationID,
                filePath,
                action,
            })

            // Wait until the controller has time to process the event
            await waitUntil(() => {
                return Promise.resolve(getSessionStub.callCount > 0)
            }, {})
            return getSessionStub.getCall(0).returnValue
        }

        it('clicking the "Reject File" button updates the file state to "rejected: true"', async () => {
            const filePath = getFilePaths(controllerSetup)[0].zipFilePath
            const session = await createCodeGenState()
            const getSessionStub = sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)

            const rejectFile = await fileClicked(getSessionStub, 'reject-change', filePath)
            assert.strictEqual(rejectFile.state.filePaths?.find(i => i.relativePath === filePath)?.rejected, true)
        })

        it('clicking the "Reject File" button and then "Revert Reject File", updates the file state to "rejected: false"', async () => {
            const filePath = getFilePaths(controllerSetup)[0].zipFilePath
            const session = await createCodeGenState()
            const getSessionStub = sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)

            await fileClicked(getSessionStub, 'reject-change', filePath)
            const revertRejection = await fileClicked(getSessionStub, 'revert-rejection', filePath)
            assert.strictEqual(revertRejection.state.filePaths?.find(i => i.relativePath === filePath)?.rejected, false)
        })
    })

    describe('insertCode', () => {
        it('sets the number of files accepted counting also deleted files', async () => {
            async function insertCode() {
                const initialState = new PrepareCodeGenState(
                    {
                        conversationId: conversationID,
                        proxyClient: new FeatureDevClient(),
                        workspaceRoots: [''],
                        workspaceFolders: [controllerSetup.workspaceFolder],
                        uploadId: uploadID,
                    },
                    '',
                    getFilePaths(controllerSetup),
                    getDeletedFiles(),
                    [],
                    tabID,
                    0
                )

                const newSession = await createSession({
                    messenger: controllerSetup.messenger,
                    sessionState: initialState,
                    conversationID,
                    tabID,
                    uploadID,
                })
                const getSessionStub = sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(newSession)

                controllerSetup.emitters.followUpClicked.fire({
                    tabID,
                    conversationID,
                    followUp: {
                        type: FollowUpTypes.InsertCode,
                    },
                })

                // Wait until the controller has time to process the event
                await waitUntil(() => {
                    return Promise.resolve(getSessionStub.callCount > 0)
                }, {})
            }

            await insertCode()

            assertTelemetry('amazonq_isAcceptedCodeChanges', {
                amazonqConversationId: conversationID,
                amazonqNumberOfFilesAccepted: 2,
                enabled: true,
                result: 'Succeeded',
            })
        })
    })
})
