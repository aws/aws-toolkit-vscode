/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { WorkflowStudioApiHandler } from '../../../stepFunctions/workflowStudio/workflowStudioApiHandler'
import { MockDocument } from '../../fake/fakeDocument'
import { ApiAction, Command, MessageType, WebviewContext } from '../../../stepFunctions/workflowStudio/types'
import * as vscode from 'vscode'

describe('WorkflowStudioApiHandler', function () {
    let postMessageStub: sinon.SinonStub
    let apiHandler: WorkflowStudioApiHandler

    beforeEach(() => {
        const panel = vscode.window.createWebviewPanel('WorkflowStudioMock', 'WorkflowStudioMockTitle', {
            viewColumn: vscode.ViewColumn.Active,
            preserveFocus: true,
        })

        postMessageStub = sinon.stub(panel.webview, 'postMessage')

        const context: WebviewContext = {
            defaultTemplateName: '',
            defaultTemplatePath: '',
            disposables: [],
            panel,
            textDocument: new MockDocument('', 'foo', async () => true),
            workSpacePath: '',
            fileStates: {},
            loaderNotification: undefined,
            fileId: '',
        }

        apiHandler = new WorkflowStudioApiHandler('us-east-1', context)
    })

    it('should handle request and response for success', async function () {
        sinon.stub(apiHandler, 'testState').returns(
            Promise.resolve({
                output: 'Test state output',
            })
        )

        await apiHandler.performApiCall({
            apiName: ApiAction.SFNTestState,
            params: {
                definition: '',
                roleArn: '',
            },
            requestId: 'test-request-id',
            command: Command.API_CALL,
            messageType: MessageType.REQUEST,
        })

        assert(
            postMessageStub.firstCall.calledWithExactly({
                messageType: MessageType.RESPONSE,
                command: Command.API_CALL,
                apiName: ApiAction.SFNTestState,
                response: {
                    output: 'Test state output',
                },
                requestId: 'test-request-id',
                isSuccess: true,
            })
        )
    })

    it('should handle request and response for error', async function () {
        sinon.stub(apiHandler, 'testState').returns(Promise.reject(new Error('Error testing state')))

        await apiHandler.performApiCall({
            apiName: ApiAction.SFNTestState,
            params: {
                definition: '',
                roleArn: '',
            },
            requestId: 'test-request-id',
            command: Command.API_CALL,
            messageType: MessageType.REQUEST,
        })

        assert(
            postMessageStub.firstCall.calledWithExactly({
                messageType: MessageType.RESPONSE,
                command: Command.API_CALL,
                apiName: ApiAction.SFNTestState,
                error: {
                    message: 'Error testing state',
                    name: 'Error',
                    stack: sinon.match.string,
                },
                isSuccess: false,
                requestId: 'test-request-id',
            })
        )
    })
})
