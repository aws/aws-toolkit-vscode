/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon'
import { commands, languages } from 'vscode'
import assert from 'assert'
import { LanguageClient } from 'vscode-languageclient'
import { AmazonQInlineCompletionItemProvider, InlineCompletionManager } from '../../../../../src/app/inline/completion'

describe('InlineCompletionManager', () => {
    let manager: InlineCompletionManager
    let languageClient: LanguageClient
    let sendNotificationStub: sinon.SinonStub
    let registerProviderStub: sinon.SinonStub
    let registerCommandStub: sinon.SinonStub
    let executeCommandStub: sinon.SinonStub
    let disposableStub: sinon.SinonStub
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()

        registerProviderStub = sandbox.stub(languages, 'registerInlineCompletionItemProvider')
        registerCommandStub = sandbox.stub(commands, 'registerCommand')
        executeCommandStub = sandbox.stub(commands, 'executeCommand')
        sendNotificationStub = sandbox.stub()

        // Create mock disposable
        const mockDisposable = {
            dispose: sandbox.stub(),
        }
        disposableStub = mockDisposable.dispose
        registerProviderStub.returns(mockDisposable)

        languageClient = {
            sendNotification: sendNotificationStub,
        } as unknown as LanguageClient

        manager = new InlineCompletionManager(languageClient)
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('constructor', () => {
        it('should initialize with language client and register provider', () => {
            assert(registerProviderStub.calledOnce)
            assert(
                registerProviderStub.calledWith(
                    sinon.match.any,
                    sinon.match.instanceOf(AmazonQInlineCompletionItemProvider)
                )
            )
        })
    })

    describe('dispose', () => {
        it('should dispose of the disposable', () => {
            manager.dispose()
            assert(disposableStub.calledOnce)
        })
    })

    describe('registerInlineCompletion', () => {
        beforeEach(() => {
            manager.registerInlineCompletion()
        })

        it('should register accept and reject commands', () => {
            assert(registerCommandStub.calledWith('aws.sample-vscode-ext-amazonq.accept'))
            assert(registerCommandStub.calledWith('aws.sample-vscode-ext-amazonq.reject'))
        })

        describe('onInlineAcceptance', () => {
            it('should send notification and re-register provider on acceptance', async () => {
                // Get the acceptance handler
                const acceptanceHandler = registerCommandStub
                    .getCalls()
                    ?.find((call) => call.args[0] === 'aws.sample-vscode-ext-amazonq.accept')?.args[1]

                const sessionId = 'test-session'
                const itemId = 'test-item'
                const requestStartTime = Date.now() - 1000
                const firstCompletionDisplayLatency = 500

                await acceptanceHandler(sessionId, itemId, requestStartTime, firstCompletionDisplayLatency)

                assert(sendNotificationStub.calledOnce)
                assert(
                    sendNotificationStub.calledWith(
                        sinon.match.any,
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
                    .find((call) => call.args[0] === 'aws.sample-vscode-ext-amazonq.reject')?.args[1]

                const sessionId = 'test-session'
                const itemId = 'test-item'

                await rejectionHandler(sessionId, itemId)

                assert(executeCommandStub.calledWith('editor.action.inlineSuggest.hide'))
                assert(sendNotificationStub.calledOnce)
                assert(
                    sendNotificationStub.calledWith(
                        sinon.match.any,
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
})
