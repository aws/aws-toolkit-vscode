/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import sinon from 'sinon'

import * as codewhispererChatClient from '../../../shared/clients/codewhispererChatClient'
import * as logger from '../../../shared/logger/logger'

import { FeatureDevClient } from '../../../amazonqFeatureDev/client/featureDev'
import { ToolkitError } from '../../../shared/errors'
import { UserWrittenCodeTracker } from '../../../codewhisperer/tracker/userWrittenCodeTracker'

describe('FeatureDev', () => {
    describe('exportResultArchive', () => {
        const conversationId = 'fake-conversation-id'
        let mockLogger: any
        let mockStreamingClient: any
        let featureDevClient: FeatureDevClient

        beforeEach(() => {
            mockLogger = {
                debug: sinon.stub(),
                error: sinon.stub(),
            }
            sinon.stub(logger, 'getLogger').returns(mockLogger)

            mockStreamingClient = {
                exportResultArchive: sinon.stub(),
            }
            sinon.stub(codewhispererChatClient, 'createCodeWhispererChatStreamingClient').resolves(mockStreamingClient)

            featureDevClient = new FeatureDevClient()
        })

        afterEach(() => {
            sinon.restore()
        })

        it('successfully exports and parses archive result', async () => {
            const mockResponse = {
                body: {
                    async *[Symbol.asyncIterator]() {
                        yield {
                            binaryPayloadEvent: {
                                bytes: Buffer.from(
                                    JSON.stringify({
                                        code_generation_result: {
                                            new_file_contents: {
                                                'file1.ts': 'content1',
                                                'file2.ts': 'content2',
                                                '.amazonq/dev/run_command_log.txt': 'should be filtered',
                                            },
                                            deleted_files: ['deleted1.ts'],
                                            references: [
                                                {
                                                    licenseName: 'MIT',
                                                    repository: 'test-repo',
                                                    url: 'http://example.com',
                                                },
                                            ],
                                        },
                                    })
                                ),
                            },
                        }
                    },
                },
            }

            mockStreamingClient.exportResultArchive.resolves(mockResponse)
            const trackSpy = sinon.stub(UserWrittenCodeTracker.instance, 'onQFeatureInvoked')
            const result = await featureDevClient.exportResultArchive(conversationId)

            assert.strictEqual(mockStreamingClient.exportResultArchive.callCount, 1)
            assert.deepStrictEqual(mockStreamingClient.exportResultArchive.getCall(0).args[0], {
                exportId: conversationId,
                exportIntent: 'TASK_ASSIST',
            })

            assert.strictEqual(trackSpy.callCount, 1)

            assert.deepStrictEqual(result.newFileContents, [
                { zipFilePath: 'file1.ts', fileContent: 'content1' },
                { zipFilePath: 'file2.ts', fileContent: 'content2' },
            ])
            assert.deepStrictEqual(result.deletedFiles, ['deleted1.ts'])
            assert.ok(result.references)
        })

        it('throws error when response body is undefined', async () => {
            mockStreamingClient.exportResultArchive.resolves({ body: undefined })

            await assert.rejects(
                async () => await featureDevClient.exportResultArchive(conversationId),
                new ToolkitError('Empty response from CodeWhisperer Streaming service.', {
                    code: 'ExportResultArchiveFailed',
                })
            )
        })

        it('throws error when internal server exception occurs', async () => {
            const mockResponse = {
                body: {
                    async *[Symbol.asyncIterator]() {
                        yield {
                            internalServerException: new Error('Internal server error'),
                        }
                    },
                },
            }

            mockStreamingClient.exportResultArchive.resolves(mockResponse)

            await assert.rejects(
                async () => await featureDevClient.exportResultArchive(conversationId),
                /Internal server error/
            )
        })

        it('handles empty result fields gracefully', async () => {
            const mockResponse = {
                body: {
                    async *[Symbol.asyncIterator]() {
                        yield {
                            binaryPayloadEvent: {
                                bytes: Buffer.from(
                                    JSON.stringify({
                                        code_generation_result: {},
                                    })
                                ),
                            },
                        }
                    },
                },
            }

            mockStreamingClient.exportResultArchive.resolves(mockResponse)

            const result = await featureDevClient.exportResultArchive(conversationId)

            assert.deepStrictEqual(result.newFileContents, [])
            assert.deepStrictEqual(result.deletedFiles, [])
            assert.deepStrictEqual(result.references, [])
        })

        it('wraps and logs errors appropriately', async () => {
            const testError = new Error('Test error')
            ;(testError as any).requestId = 'test-request-id'
            mockStreamingClient.exportResultArchive.rejects(testError)

            await assert.rejects(
                async () => await featureDevClient.exportResultArchive(conversationId),
                new ToolkitError('Test error', { code: 'ExportResultArchiveFailed' })
            )

            assert.strictEqual(mockLogger.error.callCount, 1)
            assert.ok(mockLogger.error.getCall(0).args[0].includes('test-request-id'))
        })
    })
})
