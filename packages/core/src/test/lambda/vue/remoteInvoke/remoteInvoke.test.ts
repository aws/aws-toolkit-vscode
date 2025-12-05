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
import { InvocationResponse } from '@aws-sdk/client-lambda'

// Tests to check that the internal integration between the functions operates correctly

describe('RemoteInvokeWebview', function () {
    let client: SinonStubbedInstance<LambdaClient>
    let outputChannel: vscode.OutputChannel
    const mockData = {
        FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:my-function',
    } as any
    const mockDataLMI = {
        FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:my-function',
        LambdaFunctionNode: {
            configuration: {
                CapacityProviderConfig: {
                    blah: 'blah',
                },
            },
        },
    } as any
    const input = '{"key": "value"}'
    const mockResponse = {
        LogResult: Buffer.from('Test log').toString('base64'),
        Payload: new TextEncoder().encode('{"result": "success"}'),
    } satisfies InvocationResponse

    before(async () => {
        outputChannel = {
            appendLine: (line: string) => {},
            show: () => {},
        } as vscode.OutputChannel
    })
    beforeEach(async () => {
        client = createStubInstance(DefaultLambdaClient)
    })
    it('should invoke with a simple payload', async function () {
        const remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, client, mockData)
        client.invoke.resolves(mockResponse)
        await remoteInvokeWebview.invokeLambda(input)
        sinon.assert.calledOnce(client.invoke)
        sinon.assert.calledWith(client.invoke, mockData.FunctionArn, input, undefined, 'Tail')
    })

    it('should invoke with no tail in LMI', async function () {
        const remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, client, mockDataLMI)
        client.invoke.resolves(mockResponse)
        await remoteInvokeWebview.invokeLambda(input)
        sinon.assert.calledOnce(client.invoke)
        sinon.assert.calledWith(client.invoke, mockData.FunctionArn, input, undefined, 'None')
    })

    it('Invoke Remote Lambda Function with Saved Events Payload', () => {
        const remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, client, mockData)
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
