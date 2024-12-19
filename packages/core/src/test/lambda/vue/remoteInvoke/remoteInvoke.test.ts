/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { DefaultLambdaClient, LambdaClient } from '../../../../shared/clients/lambdaClient'
import { RemoteInvokeWebview } from '../../../../lambda/vue/remoteInvoke/invokeLambda'
import * as vscode from 'vscode'
import * as samCliRemoteTestEvent from '../../../../shared/sam/cli/samCliRemoteTestEvent'
import { TestEventsOperation } from '../../../../shared/sam/cli/samCliRemoteTestEvent'
import sinon, { SinonStubbedInstance, createStubInstance } from 'sinon'
import { Lambda } from 'aws-sdk'

// Tests to check that the internal integration between the functions operates correctly

describe('RemoteInvokeWebview', function () {
    let client: SinonStubbedInstance<LambdaClient>
    let remoteInvokeWebview: RemoteInvokeWebview
    let outputChannel: vscode.OutputChannel
    let mockData: any
    before(async () => {
        client = createStubInstance(DefaultLambdaClient)
        outputChannel = {
            appendLine: (line: string) => {},
            show: () => {},
        } as vscode.OutputChannel
        mockData = {
            FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:my-function',
        }
        remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, mockData)
    })
    describe('Invoke Remote Lambda Function with Payload', () => {
        it('should invoke with a simple payload', async function () {
            const input = '{"key": "value"}'
            const mockResponse: Lambda.InvocationResponse = {
                LogResult: Buffer.from('Test log').toString('base64'),
                Payload: '{"result": "success"}',
            }
            client.invoke.resolves(mockResponse)
            await remoteInvokeWebview.invokeLambda(input)
            sinon.assert.calledOnce(client.invoke)
            sinon.assert.calledWith(client.invoke, mockData.FunctionArn, input)
        })
    })
    describe('Invoke Remote Lambda Function with Saved Events Payload', () => {
        const mockEvent = {
            name: 'TestEvent',
            arn: 'arn:aws:lambda:us-west-2:123456789012:function:myFunction',
            region: 'us-west-2',
        }
        const expectedParams = {
            name: mockEvent.name,
            operation: TestEventsOperation.Get,
            functionArn: mockEvent.arn,
            region: mockEvent.region,
        }
        const mockResponse = 'true'
        let runSamCliRemoteTestEventsStub: sinon.SinonStub
        beforeEach(() => {
            runSamCliRemoteTestEventsStub = sinon.stub(samCliRemoteTestEvent, 'runSamCliRemoteTestEvents')
        })
        afterEach(() => {
            sinon.restore()
        })
        it('should get saved event and invoke with it', async function () {
            runSamCliRemoteTestEventsStub.resolves(mockResponse)
            await remoteInvokeWebview.getRemoteTestEvents(mockEvent)

            sinon.assert.calledOnce(runSamCliRemoteTestEventsStub)
            sinon.assert.calledWith(runSamCliRemoteTestEventsStub, expectedParams)
        })
    })
})
