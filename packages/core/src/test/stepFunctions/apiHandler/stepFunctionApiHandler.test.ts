/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { StepFunctionApiHandler } from '../../../stepFunctions/messageHandlers/stepFunctionApiHandler'
import { MockDocument } from '../../fake/fakeDocument'
import {
    ApiAction,
    Command,
    MessageType,
    WebviewContext,
    WorkflowMode,
} from '../../../stepFunctions/messageHandlers/types'
import * as vscode from 'vscode'
import { assertTelemetry } from '../../testUtil'
import { StepFunctionsClient } from '../../../shared/clients/stepFunctions'
import { CloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogs'
import { DefaultLambdaClient } from '../../../shared/clients/lambdaClient'
import { IamClient } from '../../../shared/clients/iam'

describe('stepFunctionApiHandler', function () {
    let postMessageStub: sinon.SinonStub
    let apiHandler: StepFunctionApiHandler
    let testState: sinon.SinonStub

    async function assertTestApiResponse(expectedResponse: any) {
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

        assertTelemetry('ui_click', {
            elementId: 'stepfunctions_testState',
        })
        assert(postMessageStub.firstCall.calledWithExactly(expectedResponse))
    }

    beforeEach(() => {
        const panel = vscode.window.createWebviewPanel('WorkflowStudioMock', 'WorkflowStudioMockTitle', {
            viewColumn: vscode.ViewColumn.Active,
            preserveFocus: true,
        })

        postMessageStub = sinon.stub(panel.webview, 'postMessage')

        const context: WebviewContext = {
            stateMachineName: '',
            mode: WorkflowMode.Editable,
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

        const sfnClient = new StepFunctionsClient('us-east-1')
        apiHandler = new StepFunctionApiHandler('us-east-1', context, {
            sfn: sfnClient,
            iam: new IamClient('us-east-1'),
            cwl: new CloudWatchLogsClient('us-east-1'),
            lambda: new DefaultLambdaClient('us-east-1'),
        })

        testState = sinon.stub(sfnClient, 'testState')
    })

    it('should handle request and response for success', async function () {
        testState.resolves({
            output: 'Test state output',
        })

        await assertTestApiResponse({
            messageType: MessageType.RESPONSE,
            command: Command.API_CALL,
            apiName: ApiAction.SFNTestState,
            response: {
                output: 'Test state output',
            },
            requestId: 'test-request-id',
            isSuccess: true,
        })
    })

    it('should handle request and response for error', async function () {
        testState.rejects(new Error('Error testing state'))

        await assertTestApiResponse({
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
    })
})
