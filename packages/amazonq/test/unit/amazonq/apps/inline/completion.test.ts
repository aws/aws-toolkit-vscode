/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon'
import { CancellationToken, commands, languages, Position } from 'vscode'
import assert from 'assert'
import { LanguageClient } from 'vscode-languageclient'
import { AmazonQInlineCompletionItemProvider, InlineCompletionManager } from '../../../../../src/app/inline/completion'
import { RecommendationService } from '../../../../../src/app/inline/recommendationService'
import { SessionManager } from '../../../../../src/app/inline/sessionManager'
import { createMockDocument, createMockTextEditor } from 'aws-core-vscode/test'
import {
    ReferenceHoverProvider,
    ReferenceInlineProvider,
    ReferenceLogViewProvider,
} from 'aws-core-vscode/codewhisperer'
import { InlineGeneratingMessage } from '../../../../../src/app/inline/inlineGeneratingMessage'
import { LineTracker } from '../../../../../src/app/inline/stateTracker/lineTracker'
import { LineAnnotationController } from '../../../../../src/app/inline/stateTracker/lineAnnotationTracker'

describe('InlineCompletionManager', () => {
    let manager: InlineCompletionManager
    let languageClient: LanguageClient
    let sendNotificationStub: sinon.SinonStub
    let registerProviderStub: sinon.SinonStub
    let registerCommandStub: sinon.SinonStub
    let executeCommandStub: sinon.SinonStub
    let disposableStub: sinon.SinonStub
    let sandbox: sinon.SinonSandbox
    let getActiveSessionStub: sinon.SinonStub
    let getActiveRecommendationStub: sinon.SinonStub
    let logReferenceStub: sinon.SinonStub
    let getReferenceStub: sinon.SinonStub
    let hoverReferenceStub: sinon.SinonStub
    const mockDocument = createMockDocument()
    const mockEditor = createMockTextEditor()
    const mockPosition = { line: 0, character: 0 } as Position
    const mockContext = { triggerKind: 1, selectedCompletionInfo: undefined }
    const mockToken = { isCancellationRequested: false } as CancellationToken
    const fakeReferences = [
        {
            message: '',
            licenseName: 'TEST_LICENSE',
            repository: 'TEST_REPO',
            recommendationContentSpan: {
                start: 0,
                end: 10,
            },
        },
    ]
    const mockSuggestions = [
        {
            itemId: 'test-item',
            insertText: 'test',
            references: fakeReferences,
        },
    ]

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        registerProviderStub = sandbox.stub(languages, 'registerInlineCompletionItemProvider')
        registerCommandStub = sandbox.stub(commands, 'registerCommand')
        executeCommandStub = sandbox.stub(commands, 'executeCommand')
        sendNotificationStub = sandbox.stub()

        const mockDisposable = {
            dispose: sandbox.stub(),
        }
        disposableStub = mockDisposable.dispose
        registerProviderStub.returns(mockDisposable)

        languageClient = {
            sendNotification: sendNotificationStub,
        } as unknown as LanguageClient

        const sessionManager = new SessionManager()
        const lineTracker = new LineTracker()
        const lineAnnotationTracker = new LineAnnotationController(lineTracker, sessionManager)
        manager = new InlineCompletionManager(languageClient, sessionManager, lineTracker, lineAnnotationTracker)
        getActiveSessionStub = sandbox.stub(manager['sessionManager'], 'getActiveSession')
        getActiveRecommendationStub = sandbox.stub(manager['sessionManager'], 'getActiveRecommendation')
        getReferenceStub = sandbox.stub(ReferenceLogViewProvider, 'getReferenceLog')
        logReferenceStub = sandbox.stub(ReferenceLogViewProvider.instance, 'addReferenceLog')
        hoverReferenceStub = sandbox.stub(ReferenceHoverProvider.instance, 'addCodeReferences')
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('registerInlineCompletion', () => {
        beforeEach(() => {
            manager.registerInlineCompletion()
        })

        it('should register accept and reject commands', () => {
            assert(registerCommandStub.calledWith('aws.amazonq.acceptInline'))
            assert(registerCommandStub.calledWith('aws.amazonq.rejectCodeSuggestion'))
        })

        describe('onInlineAcceptance', () => {
            it('should send notification and re-register provider on acceptance', async () => {
                // Get the acceptance handler
                const acceptanceHandler = registerCommandStub
                    .getCalls()
                    ?.find((call) => call.args[0] === 'aws.amazonq.acceptInline')?.args[1]

                const sessionId = 'test-session'
                const requestStartTime = Date.now() - 1000
                const firstCompletionDisplayLatency = 500

                await acceptanceHandler(
                    sessionId,
                    mockSuggestions[0],
                    mockEditor,
                    requestStartTime,
                    firstCompletionDisplayLatency
                )

                assert(sendNotificationStub.calledOnce)
                assert(
                    sendNotificationStub.calledWith(
                        'aws/logInlineCompletionSessionResults',
                        sinon.match({
                            sessionId,
                            completionSessionResult: {
                                [mockSuggestions[0].itemId]: {
                                    seen: true,
                                    accepted: true,
                                    discarded: false,
                                },
                            },
                        })
                    )
                )

                assert(disposableStub.calledOnce)
                assert(registerProviderStub.calledTwice) // Once in constructor, once after acceptance
            })

            it('should log reference if there is any', async () => {
                const acceptanceHandler = registerCommandStub
                    .getCalls()
                    ?.find((call) => call.args[0] === 'aws.amazonq.acceptInline')?.args[1]

                const sessionId = 'test-session'
                const requestStartTime = Date.now() - 1000
                const firstCompletionDisplayLatency = 500
                const mockReferenceLog = 'test reference log'
                getReferenceStub.returns(mockReferenceLog)

                await acceptanceHandler(
                    sessionId,
                    mockSuggestions[0],
                    mockEditor,
                    requestStartTime,
                    firstCompletionDisplayLatency
                )

                assert(getReferenceStub.calledOnce)
                assert(
                    getReferenceStub.calledWith(
                        mockSuggestions[0].insertText,
                        mockSuggestions[0].references,
                        mockEditor
                    )
                )
                assert(logReferenceStub.calledOnce)
                assert(logReferenceStub.calledWith(mockReferenceLog))
                assert(hoverReferenceStub.calledOnce)
                assert(hoverReferenceStub.calledWith(mockSuggestions[0].insertText, mockSuggestions[0].references))
            })
        })

        describe('onInlineRejection', () => {
            it('should hide suggestion and send notification on rejection', async () => {
                // Get the rejection handler
                const rejectionHandler = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'aws.amazonq.rejectCodeSuggestion')?.args[1]

                const sessionId = 'test-session'
                const itemId = 'test-item'
                const mockSuggestion = {
                    itemId,
                    insertText: 'test',
                }

                getActiveSessionStub.returns({
                    sessionId: 'test-session',
                    suggestions: [mockSuggestion],
                    isRequestInProgress: false,
                    requestStartTime: Date.now(),
                })
                getActiveRecommendationStub.returns([mockSuggestion])
                await rejectionHandler()

                assert(executeCommandStub.calledWith('editor.action.inlineSuggest.hide'))
                assert(sendNotificationStub.calledOnce)
                assert(
                    sendNotificationStub.calledWith(
                        'aws/logInlineCompletionSessionResults',
                        sinon.match({
                            sessionId,
                            completionSessionResult: {
                                [itemId]: {
                                    seen: true,
                                    accepted: false,
                                    discarded: false,
                                },
                            },
                        })
                    )
                )

                assert(disposableStub.calledOnce)
                assert(registerProviderStub.calledTwice) // Once in constructor, once after rejection
            })
        })

        describe('previous command', () => {
            it('should register and handle previous command correctly', async () => {
                const prevCommandCall = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'editor.action.inlineSuggest.showPrevious')

                assert(prevCommandCall, 'Previous command should be registered')

                if (prevCommandCall) {
                    const handler = prevCommandCall.args[1]
                    await handler()

                    assert(executeCommandStub.calledWith('editor.action.inlineSuggest.hide'))
                    assert(disposableStub.calledOnce)
                    assert(registerProviderStub.calledTwice)
                    assert(executeCommandStub.calledWith('editor.action.inlineSuggest.trigger'))
                }
            })
        })

        describe('next command', () => {
            it('should register and handle next command correctly', async () => {
                const nextCommandCall = registerCommandStub
                    .getCalls()
                    .find((call) => call.args[0] === 'editor.action.inlineSuggest.showNext')

                assert(nextCommandCall, 'Next command should be registered')

                if (nextCommandCall) {
                    const handler = nextCommandCall.args[1]
                    await handler()

                    assert(executeCommandStub.calledWith('editor.action.inlineSuggest.hide'))
                    assert(disposableStub.calledOnce)
                    assert(registerProviderStub.calledTwice)
                    assert(executeCommandStub.calledWith('editor.action.inlineSuggest.trigger'))
                }
            })
        })
    })

    describe('AmazonQInlineCompletionItemProvider', () => {
        describe('provideInlineCompletionItems', () => {
            let mockSessionManager: SessionManager
            let provider: AmazonQInlineCompletionItemProvider
            let getAllRecommendationsStub: sinon.SinonStub
            let recommendationService: RecommendationService
            let setInlineReferenceStub: sinon.SinonStub
            let lineAnnotationTracker: LineAnnotationController

            beforeEach(() => {
                const lineTracker = new LineTracker()
                const activeStateController = new InlineGeneratingMessage(lineTracker)
                lineAnnotationTracker = new LineAnnotationController(lineTracker, mockSessionManager)
                recommendationService = new RecommendationService(mockSessionManager, activeStateController)
                setInlineReferenceStub = sandbox.stub(ReferenceInlineProvider.instance, 'setInlineReference')

                mockSessionManager = {
                    getActiveSession: getActiveSessionStub,
                    getActiveRecommendation: getActiveRecommendationStub,
                } as unknown as SessionManager

                getActiveSessionStub.returns({
                    sessionId: 'test-session',
                    suggestions: mockSuggestions,
                    isRequestInProgress: false,
                    requestStartTime: Date.now(),
                })
                getActiveRecommendationStub.returns(mockSuggestions)
                getAllRecommendationsStub = sandbox.stub(recommendationService, 'getAllRecommendations')
                getAllRecommendationsStub.resolves()
            }),
                it('should call recommendation service to get new suggestions for new sessions', async () => {
                    provider = new AmazonQInlineCompletionItemProvider(
                        languageClient,
                        recommendationService,
                        mockSessionManager,
                        lineAnnotationTracker
                    )
                    const items = await provider.provideInlineCompletionItems(
                        mockDocument,
                        mockPosition,
                        mockContext,
                        mockToken
                    )
                    assert(getAllRecommendationsStub.calledOnce)
                    assert.deepStrictEqual(items, mockSuggestions)
                }),
                it('should not call recommendation service for existing sessions', async () => {
                    provider = new AmazonQInlineCompletionItemProvider(
                        languageClient,
                        recommendationService,
                        mockSessionManager,
                        lineAnnotationTracker,
                        false
                    )
                    const items = await provider.provideInlineCompletionItems(
                        mockDocument,
                        mockPosition,
                        mockContext,
                        mockToken
                    )
                    assert(getAllRecommendationsStub.notCalled)
                    assert.deepStrictEqual(items, mockSuggestions)
                }),
                it('should handle reference if there is any', async () => {
                    provider = new AmazonQInlineCompletionItemProvider(
                        languageClient,
                        recommendationService,
                        mockSessionManager,
                        lineAnnotationTracker,
                        false
                    )
                    await provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)
                    assert(setInlineReferenceStub.calledOnce)
                    assert(
                        setInlineReferenceStub.calledWithExactly(
                            mockPosition.line,
                            mockSuggestions[0].insertText,
                            fakeReferences
                        )
                    )
                })
        })
    })
})
