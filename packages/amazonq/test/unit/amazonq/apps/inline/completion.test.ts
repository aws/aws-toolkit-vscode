/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon'
import {
    CancellationToken,
    commands,
    InlineCompletionItem,
    languages,
    Position,
    window,
    Range,
    InlineCompletionTriggerKind,
} from 'vscode'
import assert from 'assert'
import { LanguageClient } from 'vscode-languageclient'
import { StringValue } from 'vscode-languageserver-types'
import { AmazonQInlineCompletionItemProvider, InlineCompletionManager } from '../../../../../src/app/inline/completion'
import { RecommendationService } from '../../../../../src/app/inline/recommendationService'
import { SessionManager } from '../../../../../src/app/inline/sessionManager'
import { createMockDocument, createMockTextEditor, getTestWindow, installFakeClock } from 'aws-core-vscode/test'
import { noInlineSuggestionsMsg, ReferenceHoverProvider, ReferenceLogViewProvider } from 'aws-core-vscode/codewhisperer'
import { InlineGeneratingMessage } from '../../../../../src/app/inline/inlineGeneratingMessage'
import { LineTracker } from '../../../../../src/app/inline/stateTracker/lineTracker'
import { InlineTutorialAnnotation } from '../../../../../src/app/inline/tutorials/inlineTutorialAnnotation'

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
        const inlineTutorialAnnotation = new InlineTutorialAnnotation(lineTracker, sessionManager)
        manager = new InlineCompletionManager(languageClient, sessionManager, lineTracker, inlineTutorialAnnotation)
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
    })

    describe('AmazonQInlineCompletionItemProvider', () => {
        describe('provideInlineCompletionItems', () => {
            let mockSessionManager: SessionManager
            let provider: AmazonQInlineCompletionItemProvider
            let getAllRecommendationsStub: sinon.SinonStub
            let recommendationService: RecommendationService
            let inlineTutorialAnnotation: InlineTutorialAnnotation

            beforeEach(() => {
                const lineTracker = new LineTracker()
                const activeStateController = new InlineGeneratingMessage(lineTracker)
                inlineTutorialAnnotation = new InlineTutorialAnnotation(lineTracker, mockSessionManager)
                recommendationService = new RecommendationService(mockSessionManager, activeStateController)

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
                sandbox.stub(window, 'activeTextEditor').value(createMockTextEditor())
            }),
                it('should call recommendation service to get new suggestions for new sessions', async () => {
                    provider = new AmazonQInlineCompletionItemProvider(
                        languageClient,
                        recommendationService,
                        mockSessionManager,
                        inlineTutorialAnnotation
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
                it('should handle reference if there is any', async () => {
                    provider = new AmazonQInlineCompletionItemProvider(
                        languageClient,
                        recommendationService,
                        mockSessionManager,
                        inlineTutorialAnnotation
                    )
                    await provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)
                }),
                it('should add a range to the completion item when missing', async function () {
                    provider = new AmazonQInlineCompletionItemProvider(
                        languageClient,
                        recommendationService,
                        mockSessionManager,
                        inlineTutorialAnnotation
                    )
                    getActiveRecommendationStub.returns([
                        {
                            insertText: 'testText',
                            itemId: 'itemId',
                        },
                        {
                            insertText: 'testText2',
                            itemId: 'itemId2',
                            range: undefined,
                        },
                    ])
                    const cursorPosition = new Position(5, 6)
                    const result = await provider.provideInlineCompletionItems(
                        mockDocument,
                        cursorPosition,
                        mockContext,
                        mockToken
                    )

                    for (const item of result) {
                        assert.deepStrictEqual(item.range, new Range(cursorPosition, cursorPosition))
                    }
                }),
                it('should handle StringValue instead of strings', async function () {
                    provider = new AmazonQInlineCompletionItemProvider(
                        languageClient,
                        recommendationService,
                        mockSessionManager,
                        inlineTutorialAnnotation
                    )
                    const expectedText = 'this is my text'
                    getActiveRecommendationStub.returns([
                        {
                            insertText: { kind: 'snippet', value: 'this is my text' } satisfies StringValue,
                            itemId: 'itemId',
                        },
                    ])
                    const result = await provider.provideInlineCompletionItems(
                        mockDocument,
                        mockPosition,
                        mockContext,
                        mockToken
                    )

                    assert.strictEqual(result[0].insertText, expectedText)
                }),
                it('shows message to user when manual invoke fails to produce results', async function () {
                    provider = new AmazonQInlineCompletionItemProvider(
                        languageClient,
                        recommendationService,
                        mockSessionManager,
                        inlineTutorialAnnotation
                    )
                    getActiveRecommendationStub.returns([])
                    const messageShown = new Promise((resolve) =>
                        getTestWindow().onDidShowMessage((e) => {
                            assert.strictEqual(e.message, noInlineSuggestionsMsg)
                            resolve(true)
                        })
                    )
                    await provider.provideInlineCompletionItems(
                        mockDocument,
                        mockPosition,
                        { triggerKind: InlineCompletionTriggerKind.Invoke, selectedCompletionInfo: undefined },
                        mockToken
                    )
                    await messageShown
                })
            describe('debounce behavior', function () {
                let clock: ReturnType<typeof installFakeClock>

                beforeEach(function () {
                    clock = installFakeClock()
                })

                after(function () {
                    clock.uninstall()
                })

                it('should only trigger once on rapid events', async () => {
                    provider = new AmazonQInlineCompletionItemProvider(
                        languageClient,
                        recommendationService,
                        mockSessionManager,
                        inlineTutorialAnnotation
                    )
                    const p1 = provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)
                    const p2 = provider.provideInlineCompletionItems(mockDocument, mockPosition, mockContext, mockToken)
                    const p3 = provider.provideInlineCompletionItems(
                        mockDocument,
                        new Position(2, 2),
                        mockContext,
                        mockToken
                    )

                    await clock.tickAsync(1000)

                    // All promises should be the same object when debounced properly.
                    assert.strictEqual(p1, p2)
                    assert.strictEqual(p1, p3)
                    await p1
                    await p2
                    const r3 = await p3

                    // calls the function with the latest provided args.
                    assert.deepStrictEqual((r3 as InlineCompletionItem[])[0].range?.end, new Position(2, 2))
                })
            })
        })
    })
})
