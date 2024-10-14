/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    RemoteInvokeWebview,
    listRemoteTestEvents,
    invokeRemoteLambda,
} from '../../../../lambda/vue/remoteInvoke/invokeLambda'
import { LambdaClient } from '../../../../shared/clients/lambdaClient'
import * as vscode from 'vscode'
import { writeFile, remove } from 'fs-extra'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import sinon from 'sinon'
import * as picker from '../../../../shared/ui/picker'
import { LambdaFunctionNode } from '../../../../lambda/explorer/lambdaFunctionNode'
import * as utils from '../../../../lambda/utils'
import { HttpResourceFetcher } from '../../../../shared/resourcefetcher/httpResourceFetcher'
import * as samCliRemoteTestEvents from '../../../../shared/sam/cli/samCliRemoteTestEvent'
import { getLogger } from '../../../../shared/logger'
import * as samCliContext from '../../../../shared/sam/cli/samCliContext'
import { ExtContext } from '../../../../shared/extensions'
import { FakeExtensionContext } from '../../../fakeExtensionContext'
import { FunctionConfiguration } from 'aws-sdk/clients/lambda'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'

describe('RemoteInvokeWebview', () => {
    let outputChannel: vscode.OutputChannel
    let lambdaClient: LambdaClient
    let remoteInvokeWebview: RemoteInvokeWebview

    beforeEach(() => {
        outputChannel = {
            appendLine: (line: string) => {},
            show: () => {},
        } as vscode.OutputChannel

        lambdaClient = {
            invoke: async () => {},
        } as any

        remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, lambdaClient, {
            FunctionName: 'testFunction',
            FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            FunctionRegion: 'us-west-2',
            InputSamples: [],
        })
    })
    describe('invokeLambda', () => {
        it('invokes Lambda function successfully', async () => {
            const input = '{"key": "value"}'
            const mockResponse = {
                LogResult: Buffer.from('Test log').toString('base64'),
                Payload: '{"result": "success"}',
            }

            let invokedArn: string | undefined
            let invokedInput: string | undefined

            lambdaClient.invoke = async (arn: string, payload: string) => {
                invokedArn = arn
                invokedInput = payload
                return mockResponse
            }

            const appendedLines: string[] = []
            outputChannel.appendLine = (line: string) => {
                appendedLines.push(line)
            }

            await remoteInvokeWebview.invokeLambda(input)
            assert.strictEqual(invokedArn, 'arn:aws:lambda:us-west-2:123456789012:function:testFunction')
            assert.strictEqual(invokedInput, input)
            assert.deepStrictEqual(appendedLines, [
                'Loading response...',
                'Invocation result for arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                'Logs:',
                'Test log',
                '',
                'Payload:',
                '{"result": "success"}',
                '',
            ])
        })

        it('handles Lambda invocation error', async () => {
            const input = '{"key": "value"}'
            const mockError = new Error('Lambda invocation failed')

            lambdaClient.invoke = async () => {
                throw mockError
            }

            const appendedLines: string[] = []
            outputChannel.appendLine = (line: string) => {
                appendedLines.push(line)
            }

            try {
                await remoteInvokeWebview.invokeLambda(input)
                assert.fail('Expected an error to be thrown')
            } catch (err) {
                assert.ok(err instanceof Error)
                assert.strictEqual(
                    err.message,
                    'telemetry: invalid Metric: "lambda_invokeRemote" emitted with result=Failed but without the `reason` property. Consider using `.run()` instead of `.emit()`, which will set these properties automatically. See https://github.com/aws/aws-toolkit-vscode/blob/master/docs/telemetry.md#guidelines'
                )
            }

            assert.deepStrictEqual(appendedLines, [
                'Loading response...',
                'There was an error invoking arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                mockError.toString(),
                '',
            ])
        })
    })

    describe('loadFile', () => {
        it('loads a file successfully', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const placeholderEventFile = path.join(tempFolder, 'file.json')
            await writeFile(placeholderEventFile, '{"sample": ""}')
            const result = await remoteInvokeWebview.loadFile(placeholderEventFile)

            assert.strictEqual(result?.sample, '{"sample": ""}')
            assert.strictEqual(
                path.normalize(result.selectedFilePath).toLowerCase(),
                path.normalize(placeholderEventFile).toLowerCase()
            )
            assert.strictEqual(result?.selectedFile, 'file.json')
            await remove(tempFolder)
        })
        it('handles file load error', async () => {
            const nonExistentFile = '/path/to/non-existent-file.json'
            try {
                await remoteInvokeWebview.loadFile(nonExistentFile)
                assert.fail('Expected an error to be thrown')
            } catch (err) {
                assert.ok(err instanceof Error)
                assert.strictEqual(err.message, `Failed to read selected file`)
            }
        })
    })

    describe('listRemoteTestEvents', () => {
        const functionArn = 'arn:aws:lambda:us-west-2:123456789012:function:testFunction'
        const functionRegion = 'us-west-2'
        const mockEvents = ['event1', 'event2']
        let runListSamCliStub: sinon.SinonStub
        beforeEach(() => {
            runListSamCliStub = sinon.stub(remoteInvokeWebview, 'listRemoteTestEvents')
        })
        afterEach(() => {
            sinon.restore()
        })

        it('returns a list of remote test events', async () => {
            runListSamCliStub.resolves(mockEvents)
            const result = await remoteInvokeWebview.listRemoteTestEvents(functionArn, functionRegion)
            assert.ok(runListSamCliStub.calledOnce)
            assert(runListSamCliStub.calledWithExactly(functionArn, functionRegion))
            assert.deepStrictEqual(result, mockEvents)
        })
        it('should return an empty array when an error occurs', async () => {
            runListSamCliStub.resolves([])
            const result = await remoteInvokeWebview.listRemoteTestEvents(functionArn, functionRegion)
            assert(runListSamCliStub.calledOnce, 'runSamCliRemoteTestEvents should be called once')
            assert.deepStrictEqual(result, [])
        })
        it('should handle errors from remoteTestEvents', async () => {
            const errorMessage = 'Failed to list remote test events'
            runListSamCliStub.rejects(new Error(errorMessage))
            let caughtError: Error | undefined
            try {
                await remoteInvokeWebview.listRemoteTestEvents(functionArn, functionRegion)
            } catch (error: any) {
                caughtError = error
            }
            assert.strictEqual(caughtError?.message, errorMessage)
            assert(runListSamCliStub.calledOnce, 'runSamCliRemoteTestEvents should be called once')
        })
    })

    describe('getRemoteTestEvents', () => {
        const mockEvent = {
            name: 'TestEvent',
            arn: 'arn:aws:lambda:us-west-2:123456789012:function:myFunction',
            region: 'us-west-2',
        }
        let runGetSamCliStub: sinon.SinonStub
        beforeEach(() => {
            runGetSamCliStub = sinon.stub(remoteInvokeWebview, 'getRemoteTestEvents')
        })
        afterEach(() => {
            sinon.restore()
        })
        it('should return a remote test event', async () => {
            runGetSamCliStub.resolves(mockEvent)
            const result = await remoteInvokeWebview.getRemoteTestEvents(mockEvent)
            assert.ok(runGetSamCliStub.calledOnce)
            assert.deepStrictEqual(result, mockEvent)
        })
        it('handles errors from remoteTestEvents', async () => {
            const errorMessage = 'Failed to fetch remote test events'
            runGetSamCliStub.rejects(new Error(errorMessage))
            let caughtError: Error | undefined
            try {
                await remoteInvokeWebview.getRemoteTestEvents(mockEvent)
            } catch (error: any) {
                caughtError = error
            }
            assert.strictEqual(caughtError?.message, errorMessage)
            assert(runGetSamCliStub.calledOnce, 'runSamCliRemoteTestEvents should be called once')
        })
    })

    describe('createRemoteTestEvents', () => {
        let runCreateSamCliStub: sinon.SinonStub
        const mockEvent = {
            name: 'TestEvent',
            arn: 'arn:aws:lambda:us-west-2:123456789012:function:myFunction',
            event: '{"key": "value"}',
            region: 'us-west-2',
        }
        beforeEach(() => {
            runCreateSamCliStub = sinon.stub(remoteInvokeWebview, 'createRemoteTestEvents')
        })
        afterEach(() => {
            sinon.restore()
        })
        it('creates a remote test event', async () => {
            const expectedParams = {
                arn: 'arn:aws:lambda:us-west-2:123456789012:function:myFunction',
                event: '{"key": "value"}',
                name: 'TestEvent',
                region: 'us-west-2',
            }
            runCreateSamCliStub.resolves()
            await remoteInvokeWebview.createRemoteTestEvents(mockEvent)
            const calledParams = runCreateSamCliStub.getCall(0).args[0]
            assert.ok(runCreateSamCliStub.calledOnce)
            assert.deepStrictEqual(calledParams, expectedParams)
        })
        it('calls invoker with correct arguments for Put operation', async () => {
            const errorMessage = 'Failed to create remote test events'
            runCreateSamCliStub.rejects(new Error(errorMessage))
            try {
                await remoteInvokeWebview.createRemoteTestEvents(mockEvent)
            } catch (error: any) {
                assert.strictEqual(error.message, errorMessage)
            }
            assert.ok(runCreateSamCliStub.calledOnce)
        })
    })

    describe('getSamplePayload', () => {
        let getSampleLambdaPayloadsStub: sinon.SinonStub
        let createQuickPickStub: sinon.SinonStub
        let promptUserStub: sinon.SinonStub
        let verifySinglePickerOutputStub: sinon.SinonStub
        let httpFetcherStub: sinon.SinonStub

        beforeEach(() => {
            getSampleLambdaPayloadsStub = sinon.stub(utils, 'getSampleLambdaPayloads')
            createQuickPickStub = sinon.stub(picker, 'createQuickPick')
            promptUserStub = sinon.stub(picker, 'promptUser')
            verifySinglePickerOutputStub = sinon.stub(picker, 'verifySinglePickerOutput')
            httpFetcherStub = sinon.stub(HttpResourceFetcher.prototype, 'get')
        })

        afterEach(() => {
            sinon.restore()
        })

        it('should return sample payload when user selects a sample', async () => {
            const mockPayloads = [{ name: 'testEvent', filename: 'testEvent.json' }]
            const mockSampleContent = '{ "test": "data" }'

            getSampleLambdaPayloadsStub.resolves(mockPayloads)
            createQuickPickStub.returns({})
            promptUserStub.resolves([{ label: 'testEvent', filename: 'testEvent.json' }])
            verifySinglePickerOutputStub.returns({ label: 'testEvent', filename: 'testEvent.json' })
            httpFetcherStub.resolves(mockSampleContent)

            const result = await remoteInvokeWebview.getSamplePayload()

            assert.strictEqual(result, mockSampleContent)
        })

        it('should throw an error if fetching sample data fails', async () => {
            getSampleLambdaPayloadsStub.resolves([{ name: 'testEvent', filename: 'testEvent.json' }])
            createQuickPickStub.returns({})
            promptUserStub.resolves([{ label: 'testEvent', filename: 'testEvent.json' }])
            verifySinglePickerOutputStub.returns({ label: 'testEvent', filename: 'testEvent.json' })
            httpFetcherStub.rejects(new Error('Fetch failed'))

            await assert.rejects(async () => {
                await remoteInvokeWebview.getSamplePayload()
            }, /getting manifest data/)
        })
    })
    describe('invokeRemoteLambda', () => {
        let sandbox: sinon.SinonSandbox
        let outputChannel: vscode.OutputChannel
        let mockExtContext: ExtContext

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
            outputChannel = { append: sandbox.stub(), appendLine: sandbox.stub() } as unknown as vscode.OutputChannel
            mockExtContext = await FakeExtensionContext.getFakeExtContext()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('should invoke lambda with a LambdaFunctionNode', async () => {
            const samplePayloadsStub = sandbox.stub(utils, 'getSampleLambdaPayloads').resolves([])
            const functionNode: LambdaFunctionNode = {
                configuration: {
                    FunctionArn: 'arn:aws:lambda:region:function:functionName',
                    FunctionName: 'functionName',
                },
                regionCode: 'us-east-1',
                parent: {} as any,
                update: function (configuration: FunctionConfiguration): void {
                    throw new Error('Function not implemented.')
                },
                functionName: '',
                arn: '',
                name: '',
                serviceId: undefined,
                getChildren: function (): Thenable<AWSTreeNodeBase[]> {
                    throw new Error('Function not implemented.')
                },
                refresh: function (): void {
                    throw new Error('Function not implemented.')
                },
            }

            await invokeRemoteLambda(mockExtContext, { outputChannel, functionNode })

            sinon.assert.calledOnce(samplePayloadsStub)
        })

        it('should log an error if listing remote test events fails', async () => {
            const functionNode: LambdaFunctionNode = {
                configuration: {
                    FunctionArn: 'arn:aws:lambda:region:function:functionName',
                    FunctionName: 'functionName',
                },
                regionCode: 'us-east-1',
                parent: {} as any,
                update: function (configuration: FunctionConfiguration): void {
                    throw new Error('Function not implemented.')
                },
                functionName: '',
                arn: '',
                name: '',
                serviceId: undefined,
                getChildren: function (): Thenable<AWSTreeNodeBase[]> {
                    throw new Error('Function not implemented.')
                },
                refresh: function (): void {
                    throw new Error('Function not implemented.')
                },
            }

            const samplePayloadsStub = sandbox.stub(utils, 'getSampleLambdaPayloads').resolves([])
            const loggerErrorStub = sandbox.stub(getLogger(), 'error')

            await invokeRemoteLambda(mockExtContext, { functionNode, outputChannel })

            sinon.assert.calledOnce(samplePayloadsStub)
            sinon.assert.calledOnce(loggerErrorStub)
        })
    })

    describe('listRemoteTestEvents', () => {
        let runSamCliRemoteTestEventsStub: sinon.SinonStub
        let getSamCliContextStub: sinon.SinonStub
        let loggerStub: sinon.SinonStub
        const mockArn = 'arn:aws:lambda:us-east-1:123456789012:function:MyFunction'
        const mockRegion = 'us-east-1'

        beforeEach(() => {
            runSamCliRemoteTestEventsStub = sinon.stub(samCliRemoteTestEvents, 'runSamCliRemoteTestEvents')
            getSamCliContextStub = sinon.stub(samCliContext, 'getSamCliContext')
            getSamCliContextStub.returns({ invoker: 'samCliInvoker' })
            loggerStub = sinon.stub(getLogger(), 'debug')
        })

        afterEach(() => {
            sinon.restore()
        })

        it('should return list of remote test events when command succeeds', async () => {
            const mockResponse = 'event1\nevent2\nevent3'
            runSamCliRemoteTestEventsStub.resolves(mockResponse)

            const result = await listRemoteTestEvents(mockArn, mockRegion)

            assert.deepStrictEqual(result, ['event1', 'event2', 'event3'])
            assert(runSamCliRemoteTestEventsStub.calledOnce)
            assert(
                runSamCliRemoteTestEventsStub.calledWith({
                    functionArn: mockArn,
                    operation: 'list',
                    region: mockRegion,
                })
            )
        })

        it('should return an empty array and log error when command fails', async () => {
            const mockError = new Error('Command failed')
            runSamCliRemoteTestEventsStub.rejects(mockError)

            const result = await listRemoteTestEvents(mockArn, mockRegion)

            assert.deepStrictEqual(result, [])
            assert(runSamCliRemoteTestEventsStub.calledOnce)
            assert(loggerStub.calledOnceWith('Error listing remote test events:', mockError))
        })
    })
})
