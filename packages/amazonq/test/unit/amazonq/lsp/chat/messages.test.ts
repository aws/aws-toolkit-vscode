/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import { LanguageClient } from 'vscode-languageclient'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { registerMessageListeners } from '../../../../../src/lsp/chat/messages'
import { AmazonQChatViewProvider } from '../../../../../src/lsp/chat/webviewProvider'
import { SecondaryAuth, Connection } from 'aws-core-vscode/amazonq'

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

        beforeEach(() => {
            deleteConnectionStub = sandbox.stub().resolves()
            reauthenticateStub = sandbox.stub().resolves()

            mockAuthUtil = {
                reauthenticate: reauthenticateStub,
                secondaryAuth: {
                    deleteConnection: deleteConnectionStub,
                } as unknown as SecondaryAuth<Connection>,
            } as unknown as AuthUtil

            sandbox.replaceGetter(AuthUtil, 'instance', () => mockAuthUtil)
        })

        it('should handle re-authentication request', async () => {
            await messageHandler({
                command: 'authFollowUpClicked',
                params: {
                    authFollowupType: 're-auth',
                },
            })

            sinon.assert.calledOnce(reauthenticateStub)
            sinon.assert.notCalled(deleteConnectionStub)
        })

        it('should handle full authentication request', async () => {
            await messageHandler({
                command: 'authFollowUpClicked',
                params: {
                    authFollowupType: 'full-auth',
                },
            })

            sinon.assert.notCalled(reauthenticateStub)
            sinon.assert.calledOnce(deleteConnectionStub)
        })

        it('should log error if re-authentication fails', async () => {
            reauthenticateStub.rejects(new Error())

            await messageHandler({
                command: 'authFollowUpClicked',
                params: {
                    authFollowupType: 're-auth',
                },
            })

            sinon.assert.calledOnce(errorStub)
            sinon.assert.calledWith(errorStub, sinon.match(/Failed to re-authenticate/))
        })

        it('should log error if full authentication fails', async () => {
            deleteConnectionStub.rejects(new Error())

            await messageHandler({
                command: 'authFollowUpClicked',
                params: {
                    authFollowupType: 'full-auth',
                },
            })

            sinon.assert.calledOnce(errorStub)
            sinon.assert.calledWith(errorStub, sinon.match(/Failed to authenticate/))
        })
    })
})
