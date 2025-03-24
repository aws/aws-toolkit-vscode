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
import { createMockDocument } from 'aws-core-vscode/test'
import { ReferenceInlineProvider } from 'aws-core-vscode/codewhisperer'

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
    const mockDocument = createMockDocument()
    const mockPosition = { line: 0, character: 0 } as Position
    const mockContext = { triggerKind: 1, selectedCompletionInfo: undefined }
    const mockToken = { isCancellationRequested: false } as CancellationToken

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

        manager = new InlineCompletionManager(languageClient)
        getActiveSessionStub = sandbox.stub(manager['sessionManager'], 'getActiveSession')
        getActiveRecommendationStub = sandbox.stub(manager['sessionManager'], 'getActiveRecommendation')
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
                const itemId = 'test-item'
                const requestStartTime = Date.now() - 1000
                const firstCompletionDisplayLatency = 500

                await acceptanceHandler(sessionId, itemId, requestStartTime, firstCompletionDisplayLatency)

                assert(sendNotificationStub.calledOnce)
                assert(
                    sendNotificationStub.calledWith(
                        'aws/logInlineCompletionSessionResults',
                        sinon.match({
                            sessionId,
                            completionSessionResult: {
                                [itemId]: {
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
            let mockSessionManager: SessionManager
            let provider: AmazonQInlineCompletionItemProvider
            let getAllRecommendationsStub: sinon.SinonStub
            let recommendationService: RecommendationService
            let setInlineReferenceStub: sinon.SinonStub

            beforeEach(() => {
                recommendationService = new RecommendationService(mockSessionManager)
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
                        mockSessionManager
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
