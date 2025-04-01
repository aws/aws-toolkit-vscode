/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import { LanguageClient } from 'vscode-languageclient'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { registerMessageListeners } from '../../../../../src/lsp/chat/messages'
import { AmazonQChatViewProvider } from '../../../../../src/lsp/chat/webviewProvider'
import { secondaryAuth, authConnection, AuthFollowUpType } from 'aws-core-vscode/amazonq'

describe('registerMessageListeners', () => {
    let languageClient: LanguageClient
    let provider: AmazonQChatViewProvider
    let sandbox: sinon.SinonSandbox
    let messageHandler: (message: any) => void | Promise<void>
    let errorStub: sinon.SinonStub

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        errorStub = sandbox.stub()

        languageClient = {
            info: sandbox.stub(),
            error: errorStub,
            sendNotification: sandbox.stub(),
        } as unknown as LanguageClient

        provider = {
            webview: {
                onDidReceiveMessage: (callback: (message: any) => void | Promise<void>) => {
                    messageHandler = callback
                    return {
                        dispose: (): void => {},
                    }
                },
            },
        } as any

        registerMessageListeners(languageClient, provider, Buffer.from('test-key'))
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('AUTH_FOLLOW_UP_CLICKED', () => {
        let mockAuthUtil: AuthUtil
        let deleteConnectionStub: sinon.SinonStub
        let reauthenticateStub: sinon.SinonStub

        const authFollowUpClickedCommand = 'authFollowUpClicked'

        interface TestCase {
            authType: AuthFollowUpType
            stubToReject: sinon.SinonStub
            errorMessage: string
        }

        const testFailure = async (testCase: TestCase) => {
            testCase.stubToReject.rejects(new Error())

            await messageHandler({
                command: authFollowUpClickedCommand,
                params: {
                    authFollowupType: testCase.authType,
                },
            })

            sinon.assert.calledOnce(errorStub)
            sinon.assert.calledWith(errorStub, sinon.match(testCase.errorMessage))
        }

        beforeEach(() => {
            deleteConnectionStub = sandbox.stub().resolves()
            reauthenticateStub = sandbox.stub().resolves()

            mockAuthUtil = {
                reauthenticate: reauthenticateStub,
                secondaryAuth: {
                    deleteConnection: deleteConnectionStub,
                } as unknown as secondaryAuth.SecondaryAuth<authConnection.Connection>,
            } as unknown as AuthUtil

            sandbox.replaceGetter(AuthUtil, 'instance', () => mockAuthUtil)
        })

        it('handles re-authentication request', async () => {
            await messageHandler({
                command: authFollowUpClickedCommand,
                params: {
                    authFollowupType: 're-auth',
                },
            })

            sinon.assert.calledOnce(reauthenticateStub)
            sinon.assert.notCalled(deleteConnectionStub)
        })

        it('handles full authentication request', async () => {
            await messageHandler({
                command: authFollowUpClickedCommand,
                params: {
                    authFollowupType: 'full-auth',
                },
            })

            sinon.assert.notCalled(reauthenticateStub)
            sinon.assert.calledOnce(deleteConnectionStub)
        })

        it('logs error if re-authentication fails', async () => {
            await testFailure({
                authType: 're-auth',
                stubToReject: reauthenticateStub,
                errorMessage: 'Failed to re-authenticate',
            })
        })

        it('logs error if full authentication fails', async () => {
            await testFailure({
                authType: 'full-auth',
                stubToReject: deleteConnectionStub,
                errorMessage: 'Failed to authenticate',
            })
        })
    })
})
