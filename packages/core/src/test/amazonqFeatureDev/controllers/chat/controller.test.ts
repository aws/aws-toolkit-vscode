/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import sinon from 'sinon'
import { waitUntil } from '../../../../shared/utilities/timeoutUtils'
import { ControllerSetup, createController, createSession, generateVirtualMemoryUri } from '../../../amazonq/utils'
import {
    CurrentWsFolders,
    DeletedFileInfo,
    MetricDataOperationName,
    MetricDataResult,
    NewFileInfo,
} from '../../../../amazonq/commons/types'
import { Session } from '../../../../amazonqFeatureDev/session/session'
import { Prompter } from '../../../../shared/ui/prompter'
import { assertTelemetry, toFile } from '../../../testUtil'
import {
    CodeIterationLimitError,
    ContentLengthError,
    createUserFacingErrorMessage,
    FeatureDevServiceError,
    isAPIClientError,
    MonthlyConversationLimitError,
    NoChangeRequiredException,
    PrepareRepoFailedError,
    PromptRefusalException,
    SelectedFolderNotInWorkspaceFolderError,
    TabIdNotFoundError,
    UploadCodeError,
    UploadURLExpired,
    UserMessageNotFoundError,
    ZipFileError,
} from '../../../../amazonqFeatureDev/errors'
import {
    FeatureDevCodeGenState,
    FeatureDevPrepareCodeGenState,
} from '../../../../amazonqFeatureDev/session/sessionState'
import { FeatureDevClient } from '../../../../amazonqFeatureDev/client/featureDev'
import { createAmazonQUri } from '../../../../amazonq/commons/diff'
import { AuthUtil } from '../../../../codewhisperer'
import { featureDevScheme, featureName, messageWithConversationId } from '../../../../amazonqFeatureDev'
import { i18n } from '../../../../shared/i18n-helper'
import { FollowUpTypes } from '../../../../amazonq/commons/types'
import { ToolkitError } from '../../../../shared'
import { MessengerTypes } from '../../../../amazonqFeatureDev/controllers/chat/messenger/constants'

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
            virtualMemoryUri: generateVirtualMemoryUri(uploadID, 'myfile1.js', featureDevScheme),
            workspaceFolder: controllerSetup.workspaceFolder,
            changeApplied: false,
        },
        {
            zipFilePath: 'myfile2.js',
            relativePath: 'myfile2.js',
            fileContent: '',
            rejected: true,
            virtualMemoryUri: generateVirtualMemoryUri(uploadID, 'myfile2.js', featureDevScheme),
            workspaceFolder: controllerSetup.workspaceFolder,
            changeApplied: false,
        },
    ]

    const getDeletedFiles = (): DeletedFileInfo[] => [
        {
            zipFilePath: 'myfile3.js',
            relativePath: 'myfile3.js',
            rejected: false,
            workspaceFolder: controllerSetup.workspaceFolder,
            changeApplied: false,
        },
        {
            zipFilePath: 'myfile4.js',
            relativePath: 'myfile4.js',
            rejected: true,
            workspaceFolder: controllerSetup.workspaceFolder,
            changeApplied: false,
        },
    ]

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

        const codeGenState = new FeatureDevCodeGenState(testConfig, getFilePaths(controllerSetup), [], [], tabID, 0, {})
        const newSession = await createSession({
            messenger: controllerSetup.messenger,
            sessionState: codeGenState,
            conversationID,
            tabID,
            uploadID,
            scheme: featureDevScheme,
        })
        return newSession
    }

    before(() => {
        sinon.stub(performance, 'now').returns(0)
    })

    beforeEach(async () => {
        controllerSetup = await createController()
        session = await createSession({
            messenger: controllerSetup.messenger,
            conversationID,
            tabID,
            uploadID,
            scheme: featureDevScheme,
        })

        sinon.stub(AuthUtil.instance, 'getChatAuthState').resolves({
            codewhispererCore: 'connected',
            codewhispererChat: 'connected',
            amazonQ: 'connected',
        })
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
                    createAmazonQUri('empty', tabID, featureDevScheme),
                    createAmazonQUri(path.join(uploadID, 'src', 'mynewfile.js'), tabID, featureDevScheme)
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
                    createAmazonQUri(path.join(uploadID, 'mynewfile.js'), tabID, featureDevScheme)
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
                    createAmazonQUri(path.join(uploadID, 'src', 'mynewfile.js'), tabID, featureDevScheme)
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
                    createAmazonQUri(path.join(uploadID, 'foo', 'fi', 'mynewfile.js'), tabID, featureDevScheme)
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
                    canBeVoted: true,
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
            sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
            sinon.stub(vscode.workspace, 'getWorkspaceFolder').returns(controllerSetup.workspaceFolder)
            const expectedSourceRoot = path.join(controllerSetup.workspaceFolder.uri.fsPath, 'src')
            const modifiedSession = await modifyDefaultSourceFolder(expectedSourceRoot)
            assert.strictEqual(modifiedSession.config.workspaceRoots.length, 1)
            assert.strictEqual(modifiedSession.config.workspaceRoots[0], expectedSourceRoot)
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
            assert.strictEqual(rejectFile.state.filePaths?.find((i) => i.relativePath === filePath)?.rejected, true)
        })

        it('clicking the "Reject File" button and then "Revert Reject File", updates the file state to "rejected: false"', async () => {
            const filePath = getFilePaths(controllerSetup)[0].zipFilePath
            const session = await createCodeGenState()
            const getSessionStub = sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)

            await fileClicked(getSessionStub, 'reject-change', filePath)
            const revertRejection = await fileClicked(getSessionStub, 'revert-rejection', filePath)
            assert.strictEqual(
                revertRejection.state.filePaths?.find((i) => i.relativePath === filePath)?.rejected,
                false
            )
        })
    })

    describe('insertCode', () => {
        it('sets the number of files accepted counting also deleted files', async () => {
            async function insertCode() {
                const initialState = new FeatureDevPrepareCodeGenState(
                    {
                        conversationId: conversationID,
                        proxyClient: new FeatureDevClient(),
                        workspaceRoots: [''],
                        workspaceFolders: [controllerSetup.workspaceFolder],
                        uploadId: uploadID,
                    },
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
                    scheme: featureDevScheme,
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

    describe('processUserChatMessage', function () {
        // TODO: fix disablePreviousFileList error
        const runs = [
            { name: 'ContentLengthError', error: new ContentLengthError() },
            {
                name: 'MonthlyConversationLimitError',
                error: new MonthlyConversationLimitError('Service Quota Exceeded'),
            },
            {
                name: 'FeatureDevServiceErrorGuardrailsException',
                error: new FeatureDevServiceError(
                    i18n('AWS.amazonq.featureDev.error.codeGen.default'),
                    'GuardrailsException'
                ),
            },
            {
                name: 'FeatureDevServiceErrorEmptyPatchException',
                error: new FeatureDevServiceError(
                    i18n('AWS.amazonq.featureDev.error.throttling'),
                    'EmptyPatchException'
                ),
            },
            {
                name: 'FeatureDevServiceErrorThrottlingException',
                error: new FeatureDevServiceError(
                    i18n('AWS.amazonq.featureDev.error.codeGen.default'),
                    'ThrottlingException'
                ),
            },
            { name: 'UploadCodeError', error: new UploadCodeError('403: Forbiden') },
            { name: 'UserMessageNotFoundError', error: new UserMessageNotFoundError() },
            { name: 'TabIdNotFoundError', error: new TabIdNotFoundError() },
            { name: 'PrepareRepoFailedError', error: new PrepareRepoFailedError() },
            { name: 'PromptRefusalException', error: new PromptRefusalException() },
            { name: 'ZipFileError', error: new ZipFileError() },
            { name: 'CodeIterationLimitError', error: new CodeIterationLimitError() },
            { name: 'UploadURLExpired', error: new UploadURLExpired() },
            { name: 'NoChangeRequiredException', error: new NoChangeRequiredException() },
            { name: 'default', error: new ToolkitError('Default', { code: 'Default' }) },
        ]

        async function fireChatMessage(session: Session) {
            const getSessionStub = sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)

            controllerSetup.emitters.processHumanChatMessage.fire({
                tabID,
                conversationID,
                message: 'test message',
            })

            /**
             * Wait until the controller has time to process the event
             * Sessions should be called twice:
             * 1. When the session getWorkspaceRoot is called
             * 2. When the controller processes preloader
             */
            await waitUntil(() => {
                return Promise.resolve(getSessionStub.callCount > 1)
            }, {})
        }

        describe('onCodeGeneration', function () {
            let session: any
            let sendMetricDataTelemetrySpy: sinon.SinonStub

            const errorResultMapping = new Map([
                ['EmptyPatchException', MetricDataResult.LlmFailure],
                [PromptRefusalException.name, MetricDataResult.Error],
                [NoChangeRequiredException.name, MetricDataResult.Error],
                [MonthlyConversationLimitError.name, MetricDataResult.Error],
                [CodeIterationLimitError.name, MetricDataResult.Error],
            ])

            function getMetricResult(error: ToolkitError): MetricDataResult {
                if (error instanceof FeatureDevServiceError && error.code) {
                    return errorResultMapping.get(error.code) ?? MetricDataResult.Error
                }
                if (isAPIClientError(error)) {
                    return MetricDataResult.Error
                }
                return errorResultMapping.get(error.constructor.name) ?? MetricDataResult.Fault
            }

            async function verifyException(error: ToolkitError) {
                sinon.stub(session, 'send').throws(error)

                await fireChatMessage(session)
                await verifyMetricsCalled()
                assert.ok(
                    sendMetricDataTelemetrySpy.calledWith(
                        MetricDataOperationName.StartCodeGeneration,
                        MetricDataResult.Success
                    )
                )
                const metricResult = getMetricResult(error)
                assert.ok(
                    sendMetricDataTelemetrySpy.calledWith(MetricDataOperationName.EndCodeGeneration, metricResult)
                )
            }

            async function verifyMetricsCalled() {
                await waitUntil(() => Promise.resolve(sendMetricDataTelemetrySpy.callCount >= 2), {})
            }

            async function verifyMessage(
                expectedMessage: string,
                type: MessengerTypes,
                remainingIterations?: number,
                totalIterations?: number
            ) {
                sinon.stub(session, 'send').resolves()
                sinon.stub(session, 'sendLinesOfCodeGeneratedTelemetry').resolves() // Avoid sending extra telemetry
                const sendAnswerSpy = sinon.stub(controllerSetup.messenger, 'sendAnswer')
                sinon.stub(session.state, 'codeGenerationRemainingIterationCount').value(remainingIterations)
                sinon.stub(session.state, 'codeGenerationTotalIterationCount').value(totalIterations)

                await fireChatMessage(session)
                await verifyMetricsCalled()

                assert.ok(
                    sendAnswerSpy.calledWith({
                        type,
                        tabID,
                        message: expectedMessage,
                    })
                )
            }

            beforeEach(async () => {
                session = await createCodeGenState()
                sinon.stub(session, 'preloader').resolves()
                sendMetricDataTelemetrySpy = sinon.stub(session, 'sendMetricDataTelemetry')
            })

            it('sends success operation telemetry', async () => {
                sinon.stub(session, 'send').resolves()
                sinon.stub(session, 'sendLinesOfCodeGeneratedTelemetry').resolves() // Avoid sending extra telemetry

                await fireChatMessage(session)
                await verifyMetricsCalled()

                assert.ok(
                    sendMetricDataTelemetrySpy.calledWith(
                        MetricDataOperationName.StartCodeGeneration,
                        MetricDataResult.Success
                    )
                )
                assert.ok(
                    sendMetricDataTelemetrySpy.calledWith(
                        MetricDataOperationName.EndCodeGeneration,
                        MetricDataResult.Success
                    )
                )
            })

            for (const { name, error } of runs) {
                it(`sends failure operation telemetry on ${name}`, async () => {
                    await verifyException(error)
                })
            }

            // Using 3 to avoid spamming the tests
            for (let remainingIterations = 0; remainingIterations <= 3; remainingIterations++) {
                it(`verifies add code messages for remaining iterations at ${remainingIterations}`, async () => {
                    const totalIterations = 10
                    const expectedMessage = (() => {
                        if (remainingIterations > 2) {
                            return 'Would you like me to add this code to your project, or provide feedback for new code?'
                        } else if (remainingIterations > 0) {
                            return `Would you like me to add this code to your project, or provide feedback for new code? You have ${remainingIterations} out of ${totalIterations} code generations left.`
                        } else {
                            return 'Would you like me to add this code to your project?'
                        }
                    })()
                    await verifyMessage(expectedMessage, 'answer', remainingIterations, totalIterations)
                })
            }

            for (let remainingIterations = -1; remainingIterations <= 3; remainingIterations++) {
                let remaining: number | undefined = remainingIterations
                if (remainingIterations < 0) {
                    remaining = undefined
                }
                it(`verifies messages after cancellation for remaining iterations at ${remaining !== undefined ? remaining : 'undefined'}`, async () => {
                    const totalIterations = 10
                    const expectedMessage = (() => {
                        if (remaining === undefined || remaining > 2) {
                            return 'I stopped generating your code. If you want to continue working on this task, provide another description.'
                        } else if (remaining > 0) {
                            return `I stopped generating your code. If you want to continue working on this task, provide another description. You have ${remaining} out of ${totalIterations} code generations left.`
                        } else {
                            return "I stopped generating your code. You don't have more iterations left, however, you can start a new session."
                        }
                    })()
                    session.state.tokenSource.cancel()
                    await verifyMessage(
                        expectedMessage,
                        'answer-part',
                        remaining,
                        remaining === undefined ? undefined : totalIterations
                    )
                })
            }
        })

        describe('processErrorChatMessage', function () {
            function createTestErrorMessage(message: string) {
                return createUserFacingErrorMessage(`${featureName} request failed: ${message}`)
            }

            async function verifyException(error: ToolkitError) {
                sinon.stub(session, 'preloader').throws(error)
                const sendAnswerSpy = sinon.stub(controllerSetup.messenger, 'sendAnswer')
                const sendErrorMessageSpy = sinon.stub(controllerSetup.messenger, 'sendErrorMessage')
                const sendMonthlyLimitErrorSpy = sinon.stub(controllerSetup.messenger, 'sendMonthlyLimitError')

                await fireChatMessage(session)

                switch (error.constructor.name) {
                    case ContentLengthError.name:
                        assert.ok(
                            sendAnswerSpy.calledWith({
                                type: 'answer',
                                tabID,
                                message: error.message + messageWithConversationId(session?.conversationIdUnsafe),
                                canBeVoted: true,
                            })
                        )
                        break
                    case MonthlyConversationLimitError.name:
                        assert.ok(sendMonthlyLimitErrorSpy.calledWith(tabID))
                        break
                    case FeatureDevServiceError.name:
                    case UploadCodeError.name:
                    case UserMessageNotFoundError.name:
                    case TabIdNotFoundError.name:
                    case PrepareRepoFailedError.name:
                        assert.ok(
                            sendErrorMessageSpy.calledWith(
                                createTestErrorMessage(error.message),
                                tabID,
                                session?.retries,
                                session?.conversationIdUnsafe
                            )
                        )
                        break
                    case PromptRefusalException.name:
                    case ZipFileError.name:
                        assert.ok(
                            sendErrorMessageSpy.calledWith(
                                createTestErrorMessage(error.message),
                                tabID,
                                0,
                                session?.conversationIdUnsafe,
                                true
                            )
                        )
                        break
                    case NoChangeRequiredException.name:
                    case CodeIterationLimitError.name:
                    case UploadURLExpired.name:
                        assert.ok(
                            sendAnswerSpy.calledWith({
                                type: 'answer',
                                tabID,
                                message: error.message,
                                canBeVoted: true,
                            })
                        )
                        break
                    default:
                        assert.ok(
                            sendErrorMessageSpy.calledWith(
                                i18n('AWS.amazonq.featureDev.error.codeGen.default'),
                                tabID,
                                session?.retries,
                                session?.conversationIdUnsafe,
                                true
                            )
                        )
                        break
                }
            }

            for (const run of runs) {
                it(`should handle ${run.name}`, async function () {
                    await verifyException(run.error)
                })
            }
        })
    })

    describe('stopResponse', () => {
        it('should emit ui_click telemetry with elementId amazonq_stopCodeGeneration', async () => {
            const getSessionStub = sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)
            controllerSetup.emitters.stopResponse.fire({ tabID, conversationID })
            await waitUntil(() => {
                return Promise.resolve(getSessionStub.callCount > 0)
            }, {})
            assertTelemetry('ui_click', { elementId: 'amazonq_stopCodeGeneration' })
        })
    })

    describe('closeSession', async () => {
        async function closeSessionClicked() {
            const getSessionStub = sinon.stub(controllerSetup.sessionStorage, 'getSession').resolves(session)

            controllerSetup.emitters.followUpClicked.fire({
                tabID,
                followUp: {
                    type: FollowUpTypes.CloseSession,
                },
            })

            // Wait until the controller has time to process the event
            await waitUntil(() => {
                return Promise.resolve(getSessionStub.callCount > 0)
            }, {})
        }

        it('end chat telemetry is sent', async () => {
            await closeSessionClicked()

            assertTelemetry('amazonq_endChat', { amazonqConversationId: conversationID, result: 'Succeeded' })
        })
    })
})
