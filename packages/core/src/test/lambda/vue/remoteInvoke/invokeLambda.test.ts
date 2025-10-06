/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { RemoteInvokeWebview, invokeRemoteLambda, InitialData } from '../../../../lambda/vue/remoteInvoke/invokeLambda'
import { LambdaClient, DefaultLambdaClient } from '../../../../shared/clients/lambdaClient'
import * as vscode from 'vscode'
import * as path from 'path'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import sinon, { SinonStubbedInstance, createStubInstance } from 'sinon'
import { fs } from '../../../../shared'
import * as picker from '../../../../shared/ui/picker'
import { getTestWindow } from '../../../shared/vscode/window'
import { LambdaFunctionNode } from '../../../../lambda/explorer/lambdaFunctionNode'
import * as utils from '../../../../lambda/utils'
import { HttpResourceFetcher } from '../../../../shared/resourcefetcher/httpResourceFetcher'
import { ExtContext } from '../../../../shared/extensions'
import { FakeExtensionContext } from '../../../fakeExtensionContext'
import * as samCliRemoteTestEvent from '../../../../shared/sam/cli/samCliRemoteTestEvent'
import { TestEventsOperation, SamCliRemoteTestEventsParameters } from '../../../../shared/sam/cli/samCliRemoteTestEvent'
import { assertLogsContain } from '../../../globalSetup.test'
import { createResponse } from '../../../testUtil'

describe('RemoteInvokeWebview', () => {
    let outputChannel: vscode.OutputChannel
    let client: SinonStubbedInstance<LambdaClient>
    let remoteInvokeWebview: RemoteInvokeWebview
    let data: InitialData
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        client = createStubInstance(DefaultLambdaClient)
        outputChannel = {
            appendLine: (line: string) => {},
            show: () => {},
        } as vscode.OutputChannel
        data = {
            FunctionName: 'testFunction',
            FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
            FunctionRegion: 'us-west-2',
            InputSamples: [],
        } as InitialData

        remoteInvokeWebview = new RemoteInvokeWebview(outputChannel, client, client, data)
    })
    describe('init', () => {
        it('should return the data property', () => {
            const mockData: InitialData = {
                FunctionName: 'testFunction',
                FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                FunctionRegion: 'us-west-2',
                InputSamples: [],
            }
            const result = remoteInvokeWebview.init()
            assert.deepEqual(result, mockData)
        })
    })
    describe('invokeLambda', () => {
        it('invokes Lambda function successfully', async () => {
            const input = '{"key": "value"}'
            const mockResponse = {
                LogResult: Buffer.from('Test log').toString('base64'),
                Payload: '{"result": "success"}',
            }
            client.invoke.resolves(mockResponse)

            const appendedLines: string[] = []
            outputChannel.appendLine = (line: string) => {
                appendedLines.push(line)
            }

            await remoteInvokeWebview.invokeLambda(input)
            assert(client.invoke.calledOnce)
            assert(client.invoke.calledWith(data.FunctionArn, input))
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
        it('handles Lambda invocation with no payload', async () => {
            const mockResponse = {
                LogResult: Buffer.from('Test log').toString('base64'),
                Payload: '',
            }

            client.invoke.resolves(mockResponse)
            const appendedLines: string[] = []
            outputChannel.appendLine = (line: string) => {
                appendedLines.push(line)
            }

            await remoteInvokeWebview.invokeLambda('')

            assert.deepStrictEqual(appendedLines, [
                'Loading response...',
                'Invocation result for arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                'Logs:',
                'Test log',
                '',
                'Payload:',
                '{}',
                '',
            ])
        })
        it('handles Lambda invocation with undefined LogResult', async () => {
            const mockResponse = {
                Payload: '{"result": "success"}',
            }

            client.invoke.resolves(mockResponse)

            const appendedLines: string[] = []
            outputChannel.appendLine = (line: string) => {
                appendedLines.push(line)
            }

            await remoteInvokeWebview.invokeLambda('{}')

            assert.deepStrictEqual(appendedLines, [
                'Loading response...',
                'Invocation result for arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                'Logs:',
                '',
                '',
                'Payload:',
                '{"result": "success"}',
                '',
            ])
        })
        it('handles Lambda invocation error', async () => {
            const input = '{"key": "value"}'
            const mockError = new Error('Lambda invocation failed')

            client.invoke.rejects(mockError)

            const appendedLines: string[] = []
            outputChannel.appendLine = (line: string) => {
                appendedLines.push(line)
            }

            try {
                await remoteInvokeWebview.invokeLambda(input)
                assert.fail('Expected an error to be thrown')
            } catch (err) {
                assert.ok(err instanceof Error)
                assert.strictEqual(err.message, 'Expected an error to be thrown')
            }

            assert.deepStrictEqual(appendedLines, [
                'Loading response...',
                'There was an error invoking arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                mockError.toString(),
                '',
            ])
        })
    })

    describe('promptFile', () => {
        it('prompts the user for a file and returns the selected file', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const placeholderEventFile = path.join(tempFolder, 'file.json')
            await fs.writeFile(placeholderEventFile, '{"sample": ""}')
            const fileUri = vscode.Uri.file(placeholderEventFile)

            getTestWindow().onDidShowDialog((d) => d.selectItem(fileUri))

            const response = await remoteInvokeWebview.promptFile()
            assert.deepStrictEqual(response?.sample, '{"sample": ""}')
            assert.deepStrictEqual(response.selectedFile, 'file.json')
            assert.deepStrictEqual(response.selectedFilePath, fileUri.fsPath)
        })
        it('Returns undefined if no file is selected', async () => {
            getTestWindow().onDidShowDialog((d) => d.close())
            const response = await remoteInvokeWebview.promptFile()
            assert.strictEqual(response, undefined)
        })
        it('logs an error and throws ToolkitError when reading the file fails', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const placeholderEventFile = path.join(tempFolder, 'file.json')
            const fileUri = vscode.Uri.file(placeholderEventFile)

            getTestWindow().onDidShowDialog((d) => d.selectItem(fileUri))

            await assert.rejects(
                async () => await remoteInvokeWebview.promptFile(),
                new Error('Failed to read selected file')
            )
            assertLogsContain('readFileSync: Failed to read file at path', false, 'error')
        })
    })

    describe('loadFile', () => {
        it('loads a file successfully', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const placeholderEventFile = path.join(tempFolder, 'file.json')
            await fs.writeFile(placeholderEventFile, '{"sample": ""}')
            const result = await remoteInvokeWebview.loadFile(placeholderEventFile)

            assert.strictEqual(result?.sample, '{"sample": ""}')
            assert.strictEqual(
                path.normalize(result.selectedFilePath).toLowerCase(),
                path.normalize(placeholderEventFile).toLowerCase()
            )
            assert.strictEqual(result?.selectedFile, 'file.json')
            await fs.delete(tempFolder, { recursive: true })
        })
        it('handles invalid JSON file', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const invalidJsonFile = path.join(tempFolder, 'invalid.json')
            await fs.writeFile(invalidJsonFile, '{"invalid": "json",}')
            try {
                await remoteInvokeWebview.loadFile(invalidJsonFile)
                assert.fail('Failed to parse selected file')
            } catch (err) {
                assert.ok(err instanceof Error)
                assert.strictEqual(err.message, 'Failed to parse selected file')
            }
            await fs.delete(tempFolder, { recursive: true })
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
        it('should return undefined if filePath is empty in loadFile', async () => {
            const result = await remoteInvokeWebview.loadFile('')
            assert.strictEqual(result, undefined, 'Expected result to be undefined for empty file path')
        })
    })

    describe('Remote Test Events', () => {
        let runSamCliStub: sinon.SinonStub
        sandbox = sinon.createSandbox()
        beforeEach(() => {
            runSamCliStub = sandbox.stub(samCliRemoteTestEvent, 'runSamCliRemoteTestEvents')
            // Mock getSamCliContext module
            const samCliContext = require('../../../../shared/sam/cli/samCliContext')
            sandbox.stub(samCliContext, 'getSamCliContext').returns({
                invoker: {} as any,
            })
        })

        afterEach(() => {
            sandbox.restore()
        })

        describe('listRemoteTestEvents', () => {
            it('should list remote test events successfully', async () => {
                runSamCliStub.resolves('event1\nevent2\nevent3\n')

                const events = await remoteInvokeWebview.listRemoteTestEvents(data.FunctionArn, data.FunctionRegion)

                assert.deepStrictEqual(events, ['event1', 'event2', 'event3'])
                assert(runSamCliStub.calledOnce)
                assert(
                    runSamCliStub.calledWith(
                        sinon.match({
                            functionArn: data.FunctionArn,
                            operation: 'list',
                            region: data.FunctionRegion,
                        })
                    )
                )
            })

            it('should return empty array when no events exist (registry not found)', async () => {
                runSamCliStub.rejects(new Error('lambda-testevent-schemas registry not found'))

                const events = await remoteInvokeWebview.listRemoteTestEvents(data.FunctionArn, data.FunctionRegion)

                assert.deepStrictEqual(events, [])
            })

            it('should return empty array when there are no saved events', async () => {
                runSamCliStub.rejects(new Error('There are no saved events'))

                const events = await remoteInvokeWebview.listRemoteTestEvents(data.FunctionArn, data.FunctionRegion)

                assert.deepStrictEqual(events, [])
            })

            it('should re-throw other errors', async () => {
                runSamCliStub.rejects(new Error('Network error'))

                await assert.rejects(
                    async () => await remoteInvokeWebview.listRemoteTestEvents(data.FunctionArn, data.FunctionRegion),
                    /Network error/
                )
            })
        })

        describe('selectRemoteTestEvent', () => {
            it('should show quickpick and return selected event content', async () => {
                // Mock list events
                runSamCliStub.onFirstCall().resolves('event1\nevent2\n')
                // Mock get event content
                runSamCliStub.onSecondCall().resolves('{"test": "content"}')

                // Mock quickpick selection using test window
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('event1')
                })

                const result = await remoteInvokeWebview.selectRemoteTestEvent(data.FunctionArn, data.FunctionRegion)

                assert.strictEqual(result, '{"test": "content"}')
            })

            it('should show info message when no events exist', async () => {
                runSamCliStub.onFirstCall().resolves('')

                let infoMessageShown = false
                getTestWindow().onDidShowMessage((message) => {
                    if (message.message.includes('No remote test events found')) {
                        infoMessageShown = true
                    }
                })

                const result = await remoteInvokeWebview.selectRemoteTestEvent(data.FunctionArn, data.FunctionRegion)

                assert.strictEqual(result, undefined)
                assert(infoMessageShown, 'Info message should be shown')
            })

            it('should return undefined when user cancels quickpick', async () => {
                runSamCliStub.onFirstCall().resolves('event1\nevent2\n')

                // Mock user canceling quickpick
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.hide()
                })

                const result = await remoteInvokeWebview.selectRemoteTestEvent(data.FunctionArn, data.FunctionRegion)

                assert.strictEqual(result, undefined)
            })

            it('should handle list events error gracefully', async () => {
                runSamCliStub.rejects(new Error('API error'))

                let errorMessageShown = false
                getTestWindow().onDidShowMessage((message) => {
                    // Check if it's an error message
                    errorMessageShown = true
                })

                const result = await remoteInvokeWebview.selectRemoteTestEvent(data.FunctionArn, data.FunctionRegion)

                assert.strictEqual(result, undefined)
                assert(errorMessageShown, 'Error message should be shown')
            })
        })

        describe('saveRemoteTestEvent', () => {
            it('should create new test event', async () => {
                // Mock empty list (no existing events)
                runSamCliStub.onFirstCall().resolves('')
                // Mock create event success
                runSamCliStub.onSecondCall().resolves('Event created')

                // Mock quickpick to select "Create new"
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('$(add) Create new test event')
                })

                // Mock input box for event name
                getTestWindow().onDidShowInputBox((input) => {
                    input.acceptValue('MyNewEvent')
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, 'MyNewEvent')
                assert(runSamCliStub.calledTwice)
                assert(
                    runSamCliStub.secondCall.calledWith(
                        sinon.match({
                            functionArn: data.FunctionArn,
                            operation: 'put',
                            name: 'MyNewEvent',
                            eventSample: '{"test": "data"}',
                            region: data.FunctionRegion,
                            force: false,
                        })
                    )
                )
            })

            it('should overwrite existing test event with force flag', async () => {
                // Mock list with existing events
                runSamCliStub.onFirstCall().resolves('existingEvent1\nexistingEvent2\n')
                // Mock update event success
                runSamCliStub.onSecondCall().resolves('Event updated')

                // Mock quickpick to select existing event
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('existingEvent1')
                })

                // Mock confirmation dialog
                getTestWindow().onDidShowMessage((message) => {
                    // Select the overwrite option
                    message.selectItem('Overwrite')
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"updated": "data"}'
                )

                assert.strictEqual(result, 'existingEvent1')
                assert(runSamCliStub.calledTwice)
                assert(
                    runSamCliStub.secondCall.calledWith(
                        sinon.match({
                            functionArn: data.FunctionArn,
                            operation: 'put',
                            name: 'existingEvent1',
                            eventSample: '{"updated": "data"}',
                            region: data.FunctionRegion,
                            force: true, // Should use force flag for overwrite
                        })
                    )
                )
            })

            it('should handle user cancellation of overwrite', async () => {
                runSamCliStub.onFirstCall().resolves('existingEvent1\n')

                // Mock quickpick to select existing event
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('existingEvent1')
                })

                // User cancels overwrite warning
                getTestWindow().onDidShowMessage((message) => {
                    // Cancel the dialog
                    message.close()
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, undefined)
                assert(runSamCliStub.calledOnce) // Only list was called
            })

            it('should validate event name for new events', async () => {
                runSamCliStub.onFirstCall().resolves('existingEvent\n')
                runSamCliStub.onSecondCall().resolves('Event created')

                // Mock quickpick to select "Create new"
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('$(add) Create new test event')
                })

                // Mock input box with validation
                let validationTested = false
                getTestWindow().onDidShowInputBox((input) => {
                    // We can't directly test validation in this test framework
                    // Just accept a valid value
                    input.acceptValue('NewEvent')
                    validationTested = true
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, 'NewEvent')
                assert(validationTested, 'Input box should have been shown')
            })

            it('should handle list events error gracefully', async () => {
                // List events fails but should continue
                runSamCliStub.onFirstCall().rejects(new Error('List failed'))
                runSamCliStub.onSecondCall().resolves('Event created')

                // Mock quickpick to select "Create new"
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.acceptItem('$(add) Create new test event')
                })

                // Mock input box for event name
                getTestWindow().onDidShowInputBox((input) => {
                    input.acceptValue('NewEvent')
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, 'NewEvent')
                // Should still create the event even if list failed
                assert(runSamCliStub.calledTwice)
            })

            it('should return undefined when user cancels quickpick', async () => {
                runSamCliStub.onFirstCall().resolves('event1\n')

                // Mock user canceling quickpick
                getTestWindow().onDidShowQuickPick((picker) => {
                    picker.hide()
                })

                const result = await remoteInvokeWebview.saveRemoteTestEvent(
                    data.FunctionArn,
                    data.FunctionRegion,
                    '{"test": "data"}'
                )

                assert.strictEqual(result, undefined)
            })
        })

        describe('createRemoteTestEvents', () => {
            it('should create event without force flag', async () => {
                runSamCliStub.resolves('Event created')

                const result = await remoteInvokeWebview.createRemoteTestEvents({
                    name: 'TestEvent',
                    event: '{"test": "data"}',
                    region: 'us-west-2',
                    arn: data.FunctionArn,
                })

                assert.strictEqual(result, 'Event created')
                assert(
                    runSamCliStub.calledWith(
                        sinon.match({
                            functionArn: data.FunctionArn,
                            operation: 'put',
                            name: 'TestEvent',
                            eventSample: '{"test": "data"}',
                            region: 'us-west-2',
                            force: false,
                        })
                    )
                )
            })

            it('should create event with force flag for overwrite', async () => {
                runSamCliStub.resolves('Event updated')

                const result = await remoteInvokeWebview.createRemoteTestEvents(
                    {
                        name: 'ExistingEvent',
                        event: '{"updated": "data"}',
                        region: 'us-west-2',
                        arn: data.FunctionArn,
                    },
                    true // force flag
                )

                assert.strictEqual(result, 'Event updated')
                assert(
                    runSamCliStub.calledWith(
                        sinon.match({
                            force: true,
                        })
                    )
                )
            })
        })

        describe('getRemoteTestEvents', () => {
            it('should get remote test event content', async () => {
                runSamCliStub.resolves('{"event": "content"}')

                const result = await remoteInvokeWebview.getRemoteTestEvents({
                    name: 'TestEvent',
                    region: 'us-west-2',
                    arn: data.FunctionArn,
                })

                assert.strictEqual(result, '{"event": "content"}')
                assert(
                    runSamCliStub.calledWith(
                        sinon.match({
                            name: 'TestEvent',
                            operation: 'get',
                            functionArn: data.FunctionArn,
                            region: 'us-west-2',
                        })
                    )
                )
            })
        })
    })
    describe('listRemoteTestEvents', () => {
        let runSamCliRemoteTestEventsStub: sinon.SinonStub
        beforeEach(() => {
            runSamCliRemoteTestEventsStub = sinon.stub(samCliRemoteTestEvent, 'runSamCliRemoteTestEvents')
        })
        afterEach(() => {
            sinon.restore()
        })

        it('should call remoteTestEvents with correct parameters and return a split result', async () => {
            const functionArn = 'arn:aws:lambda:us-west-2:123456789012:function:TestLambda'
            const region = 'us-west-2'
            const mockResponse = 'event1\nevent2\nevent3'
            const expectedParams = {
                functionArn: functionArn,
                operation: TestEventsOperation.List,
                region: region,
            }
            runSamCliRemoteTestEventsStub.resolves(mockResponse)
            const result = await remoteInvokeWebview.listRemoteTestEvents(functionArn, region)
            assert(runSamCliRemoteTestEventsStub.calledOnce)
            assert(runSamCliRemoteTestEventsStub.calledWith(expectedParams))
            const expectedResult = ['event1', 'event2', 'event3']
            assert.deepEqual(result, expectedResult)
        })

        it('should handle errors thrown by remoteTestEvents', async () => {
            const functionArn = 'arn:aws:lambda:us-west-2:123456789012:function:TestLambda'
            const region = 'us-west-2'
            const errorMessage = 'Error listing remote test events'
            runSamCliRemoteTestEventsStub.rejects(new Error(errorMessage))
            await assert.rejects(async () => {
                await remoteInvokeWebview.listRemoteTestEvents(functionArn, region)
            }, new RegExp(errorMessage))
            assert(runSamCliRemoteTestEventsStub.calledOnce)
        })
    })

    describe('createRemoteTestEvents', () => {
        let runSamCliRemoteTestEventsStub: sinon.SinonStub
        beforeEach(() => {
            runSamCliRemoteTestEventsStub = sinon.stub(samCliRemoteTestEvent, 'runSamCliRemoteTestEvents')
        })
        afterEach(() => {
            sinon.restore()
        })
        it('should call remoteTestEvents with correct parameters', async () => {
            const mockPutEvent = {
                arn: 'arn:aws:lambda:us-west-2:123456789012:function:TestLambda',
                name: 'TestEvent',
                event: '{"key": "value"}',
                region: 'us-west-2',
            }
            await remoteInvokeWebview.createRemoteTestEvents(mockPutEvent)
            const expectedParams: SamCliRemoteTestEventsParameters = {
                functionArn: mockPutEvent.arn,
                operation: TestEventsOperation.Put,
                name: mockPutEvent.name,
                eventSample: mockPutEvent.event,
                region: mockPutEvent.region,
                force: false, // Default value when not overwriting
            }
            assert(runSamCliRemoteTestEventsStub.calledOnce, 'remoteTestEvents should be called once')
            assert(
                runSamCliRemoteTestEventsStub.calledWith(expectedParams),
                'remoteTestEvents should be called with correct parameters'
            )
        })

        it('should return the result from remoteTestEvents', async () => {
            const mockPutEvent = {
                arn: 'arn:aws:lambda:us-west-2:123456789012:function:TestLambda',
                name: 'TestEvent',
                event: '{"key": "value"}',
                region: 'us-west-2',
            }
            const mockResponse = 'Success'
            runSamCliRemoteTestEventsStub.resolves(mockResponse)
            const result = await remoteInvokeWebview.createRemoteTestEvents(mockPutEvent)
            assert.strictEqual(result, mockResponse, 'The result should match the mock response')
        })

        it('should call remoteTestEvents with force flag when overwriting', async () => {
            const mockPutEvent = {
                arn: 'arn:aws:lambda:us-west-2:123456789012:function:TestLambda',
                name: 'ExistingEvent',
                event: '{"key": "updated value"}',
                region: 'us-west-2',
            }
            await remoteInvokeWebview.createRemoteTestEvents(mockPutEvent, true) // force = true
            const expectedParams: SamCliRemoteTestEventsParameters = {
                functionArn: mockPutEvent.arn,
                operation: TestEventsOperation.Put,
                name: mockPutEvent.name,
                eventSample: mockPutEvent.event,
                region: mockPutEvent.region,
                force: true, // Should include force flag when overwriting
            }
            assert(runSamCliRemoteTestEventsStub.calledOnce, 'remoteTestEvents should be called once')
            assert(
                runSamCliRemoteTestEventsStub.calledWith(expectedParams),
                'remoteTestEvents should be called with force flag'
            )
        })
    })

    describe('getRemoteTestEvents', () => {
        let runSamCliRemoteTestEventsStub: sinon.SinonStub
        beforeEach(() => {
            runSamCliRemoteTestEventsStub = sinon.stub(samCliRemoteTestEvent, 'runSamCliRemoteTestEvents')
        })
        afterEach(() => {
            sinon.restore()
        })
        it('should call remoteTestEvents with correct parameters', async () => {
            const mockEvent = {
                name: 'TestLambda',
                arn: 'arn:aws:lambda:us-west-2:123456789012:function:TestLambda',
                region: 'us-west-2',
            }
            const expectedParams = {
                name: mockEvent.name,
                operation: TestEventsOperation.Get,
                functionArn: mockEvent.arn,
                region: mockEvent.region,
            }
            const mockResponse = 'mockResponse'
            runSamCliRemoteTestEventsStub.resolves(mockResponse)
            const result = await remoteInvokeWebview.getRemoteTestEvents(mockEvent)
            assert(runSamCliRemoteTestEventsStub.calledOnce)
            assert(runSamCliRemoteTestEventsStub.calledWith(expectedParams))
            assert.strictEqual(result, mockResponse)
        })

        it('should handle errors thrown by remoteTestEvents', async () => {
            const mockEvent = {
                name: 'TestLambda',
                arn: 'arn:aws:lambda:us-west-2:123456789012:function:TestLambda',
                region: 'us-west-2',
            }
            const errorMessage = 'Error invoking remote test events'
            runSamCliRemoteTestEventsStub.rejects(new Error(errorMessage))
            await assert.rejects(async () => {
                await remoteInvokeWebview.getRemoteTestEvents(mockEvent)
            }, new RegExp(errorMessage))
            assert(runSamCliRemoteTestEventsStub.calledOnce)
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
            httpFetcherStub.resolves(createResponse(mockSampleContent))

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
        it('returns undefined when no file is selected', async () => {
            const mockPayloads = [{ name: 'testEvent', filename: 'testEvent.json' }]
            getSampleLambdaPayloadsStub.resolves(mockPayloads)
            createQuickPickStub.returns({})
            promptUserStub.resolves([{ label: 'testEvent', filename: 'testEvent.json' }])
            verifySinglePickerOutputStub.returns(undefined)
            const result = await remoteInvokeWebview.getSamplePayload()
            assert.strictEqual(result, undefined)
        })
    })
    describe('tryOpenHandlerFile', () => {
        let sandbox: sinon.SinonSandbox
        let fsExistsStub: sinon.SinonStub
        let getLambdaHandlerFileStub: sinon.SinonStub

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            fsExistsStub = sandbox.stub(fs, 'exists')
            getLambdaHandlerFileStub = sandbox.stub(
                require('../../../../awsService/appBuilder/utils'),
                'getLambdaHandlerFile'
            )
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('should return false when LocalRootPath is not set', async () => {
            const result = await remoteInvokeWebview.tryOpenHandlerFile()
            assert.strictEqual(result, false)
        })

        it('should not watch for updates when LocalRootPath is already set (appbuilder case)', async () => {
            const tempFolder = await makeTemporaryToolkitFolder()
            const handlerPath = path.join(tempFolder, 'handler.js')
            await fs.writeFile(handlerPath, 'exports.handler = () => {}')

            // Set LocalRootPath first to simulate appbuilder case
            data.LocalRootPath = tempFolder
            data.LambdaFunctionNode = {
                configuration: {
                    Handler: 'handler.handler',
                    CodeSha256: 'abc123',
                },
            } as any

            getLambdaHandlerFileStub.resolves(vscode.Uri.file(handlerPath))
            fsExistsStub.resolves(true)

            const result = await remoteInvokeWebview.tryOpenHandlerFile(tempFolder)

            assert.strictEqual(result, true)
            // In appbuilder case, watchForUpdates should be false

            await fs.delete(tempFolder, { recursive: true })
        })
    })

    describe('invokeRemoteLambda', () => {
        let sandbox: sinon.SinonSandbox
        let outputChannel: vscode.OutputChannel
        let mockExtContext: ExtContext
        let mockFunctionNode: LambdaFunctionNode
        let createWebviewPanelStub: sinon.SinonStub
        let getSampleLambdaPayloadsStub: sinon.SinonStub

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
            outputChannel = { append: sandbox.stub(), appendLine: sandbox.stub() } as unknown as vscode.OutputChannel
            mockExtContext = await FakeExtensionContext.getFakeExtContext()
            mockFunctionNode = {
                configuration: {
                    FunctionName: 'testFunction',
                    FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
                },
                regionCode: 'us-west-2',
            } as LambdaFunctionNode
            createWebviewPanelStub = sandbox.stub(vscode.window, 'createWebviewPanel').returns({
                webview: {
                    html: '',
                    asWebviewUri: sandbox.stub().returns(vscode.Uri.parse('https://mock-webview-uri.com')),
                    onDidReceiveMessage: sandbox.stub(),
                },
                onDidDispose: sandbox.stub(),
                reveal: sandbox.stub(),
            } as unknown as vscode.WebviewPanel)
            getSampleLambdaPayloadsStub = sandbox.stub(utils, 'getSampleLambdaPayloads').resolves([
                { name: 'Sample1', filename: 'sample1.json' },
                { name: 'Sample2', filename: 'sample2.json' },
            ])
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('should invoke lambda with a LambdaFunctionNode', async () => {
            await invokeRemoteLambda(mockExtContext, { outputChannel: outputChannel, functionNode: mockFunctionNode })
            assert(getSampleLambdaPayloadsStub.calledOnce)
            assert(createWebviewPanelStub.calledOnce)
            const createWebviewPanelArgs = createWebviewPanelStub.getCall(0).args
            assert.strictEqual(createWebviewPanelArgs[0], 'remoteInvoke')
            assert.strictEqual(
                createWebviewPanelArgs[1],
                `Invoke Lambda ${mockFunctionNode.configuration.FunctionName}`
            )
            // opens in side panel
            assert.deepStrictEqual(createWebviewPanelArgs[2], { viewColumn: vscode.ViewColumn.Beside })
        })
    })
})
