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
    const input = '{"key": "value"}'
    const mockResponse = {
        LogResult: Buffer.from('Test log').toString('base64'),
        Payload: new TextEncoder().encode('{"result": "success"}'),
    } satisfies InvocationResponse

    before(() => {
        outputChannel = {
            appendLine: (line: string) => {},
            show: () => {},
        } as vscode.OutputChannel
    })
    beforeEach(() => {
        client = createStubInstance(DefaultLambdaClient)
    })
    afterEach(() => {
        sinon.restore()
    })
    const invokeScenarios: {
        name: string
        data: any
        expectedQualifier: string | undefined
        expectedLogType: 'Tail' | 'None'
    }[] = [
        {
            name: 'should invoke with a simple payload',
            data: mockData,
            expectedQualifier: undefined,
            expectedLogType: 'Tail',
        },
        {
            name: 'should invoke with no tail in LMI',
            data: {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:my-function',
                LambdaFunctionNode: {
                    configuration: {
                        CapacityProviderConfig: {
                            blah: 'blah',
                        },
                    },
                },
            },
            expectedQualifier: undefined,
            expectedLogType: 'None',
        },
        {
            name: 'should invoke $LATEST in Durable Function',
            data: {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:my-function',
                LambdaFunctionNode: {
                    configuration: {
                        DurableConfig: {
                            blah: 'blah',
                        },
                    },
                },
            },
            expectedQualifier: '$LATEST',
            expectedLogType: 'Tail',
        },
        {
            name: 'should invoke $LATEST.PUBLISHED in LMI Durable Function',
            data: {
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:my-function',
                LambdaFunctionNode: {
                    configuration: {
                        DurableConfig: {
                            blah: 'blah',
                        },
                        CapacityProviderConfig: {
                            blah: 'blah',
                        },
                    },
                },
            },
            expectedQualifier: '$LATEST.PUBLISHED',
            expectedLogType: 'None',
        },
    ]

    for (const scenario of invokeScenarios) {
        it(scenario.name, async function () {
            const remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, client, scenario.data)
            client.invoke.resolves(mockResponse)
            await remoteInvokeWebview.invokeLambda(input)
            sinon.assert.calledOnce(client.invoke)
            sinon.assert.calledWith(
                client.invoke,
                scenario.data.FunctionArn,
                input,
                scenario.expectedQualifier,
                scenario.expectedLogType
            )
        })
    }

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
    const mockEventResponse = 'true'

    it('should get saved event and invoke with it', async function () {
        const remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, client, mockData)
        const runSamCliRemoteTestEventsStub = sinon.stub(samCliRemoteTestEvent, 'runSamCliRemoteTestEvents')
        runSamCliRemoteTestEventsStub.resolves(mockEventResponse)
        await remoteInvokeWebview.getRemoteTestEvents(mockEvent)

        sinon.assert.calledOnce(runSamCliRemoteTestEventsStub)
        sinon.assert.calledWith(runSamCliRemoteTestEventsStub, expectedParams)
    })
})
