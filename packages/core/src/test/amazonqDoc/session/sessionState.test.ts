/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import { DocPrepareCodeGenState } from '../../../amazonqDoc'
import { createMockSessionStateAction } from '../../amazonq/utils'
import { createTestContext, setupTestHooks } from '../../amazonq/session/testSetup'
const filesModule = require('../../../amazonq/util/files')

describe('sessionStateDoc', () => {
    const context = createTestContext()
    setupTestHooks(context)

    describe('DocPrepareCodeGenState', () => {
        it('error when failing to prepare repo information', async () => {
            sinon.stub(vscode.workspace, 'findFiles').throws()
            context.testMocks.createUploadUrl!.resolves({ uploadId: '', uploadUrl: '' })
            const testAction = createMockSessionStateAction()

            await assert.rejects(() => {
                return new DocPrepareCodeGenState(context.testConfig, [], [], [], context.tabId, 0).interact(testAction)
            })
        })
    })

    describe('CodeGenBase generateCode log file handling', () => {
        const RunCommandLogFileName = '.amazonq/dev/run_command.log'
        const registerNewFilesStub = sinon.stub()
        registerNewFilesStub.callsFake((fs: any, newFileContents: any[]) => {
            return newFileContents
        })
        const getDeletedFileInfosStub = sinon.stub()
        getDeletedFileInfosStub.callsFake((fs: any, deletedFiles: any[]) => {
            return []
        })

        class TestCodeGen extends (require('../../../amazonq/session/sessionState') as any).CodeGenBase {
            public generatedFiles: any[] = []
            constructor(config: any, tabID: string) {
                super(config, tabID)
            }
            protected handleProgress(messenger: any, action: any, detail?: string): void {
                // no-op
            }
            protected getScheme(): string {
                return 'file'
            }
            protected getTimeoutErrorCode(): string {
                return 'test_timeout'
            }
            protected handleGenerationComplete(messenger: any, newFileInfo: any[], action: any): void {
                this.generatedFiles = newFileInfo
            }
            protected handleError(messenger: any, codegenResult: any): Error {
                throw new Error('handleError called')
            }
        }

        let testConfig: any
        let fakeProxyClient: any
        let fsMock: any
        let telemetryMock: any
        let messengerMock: any
        let testAction: any

        beforeEach(() => {
            fakeProxyClient = {
                getCodeGeneration: sinon.stub().resolves({
                    codeGenerationStatus: { status: 'Complete' },
                    codeGenerationRemainingIterationCount: 0,
                    codeGenerationTotalIterationCount: 1,
                }),
                exportResultArchive: sinon.stub(),
            }

            testConfig = {
                conversationId: 'conv1',
                uploadId: 'upload1',
                workspaceRoots: ['/workspace'],
                proxyClient: fakeProxyClient,
            }

            fsMock = {
                stat: sinon.stub(),
                readFile: sinon.stub(),
                writeFile: sinon.stub(),
            }

            telemetryMock = {
                setCodeGenerationResult: sinon.spy(),
                setNumberOfFilesGenerated: sinon.spy(),
                setAmazonqNumberOfReferences: sinon.spy(),
                setGenerateCodeIteration: sinon.spy(),
                setGenerateCodeLastInvocationTime: sinon.spy(),
                recordUserCodeGenerationTelemetry: sinon.spy(),
            }

            messengerMock = {
                sendAnswer: sinon.spy(),
            }

            testAction = {
                telemetry: telemetryMock,
                fs: fsMock,
                messenger: messengerMock,
                uploadHistory: {},
                tokenSource: { token: { isCancellationRequested: false, onCancellationRequested: () => {} } },
            }
        })

        afterEach(() => {
            sinon.restore()
        })

        it('writes to the log file, present or not', async () => {
            const logFileInfo = {
                zipFilePath: RunCommandLogFileName,
                fileContent: 'newLog',
            }
            const otherFile = { zipFilePath: 'other.ts', fileContent: 'other' }

            fakeProxyClient.exportResultArchive.resolves({
                newFileContents: [logFileInfo, otherFile],
                deletedFiles: [],
                references: [],
            })

            fsMock.writeFile.resolves()

            sinon.stub(filesModule, 'registerNewFiles').callsFake(registerNewFilesStub)
            sinon.stub(filesModule, 'getDeletedFileInfos').callsFake(getDeletedFileInfosStub)

            const testCodeGen = new TestCodeGen(testConfig, 'tab1')

            await testCodeGen.generateCode({
                messenger: messengerMock,
                fs: fsMock,
                codeGenerationId: 'codegen2',
                telemetry: telemetryMock,
                workspaceFolders: {},
                action: testAction,
            })

            const expectedFilePath = `${testConfig.workspaceRoots[0]}/${RunCommandLogFileName}`
            const fileUri = vscode.Uri.file(expectedFilePath)
            sinon.assert.calledWith(fsMock.writeFile, fileUri, new TextEncoder().encode('newLog'), {
                create: true,
                overwrite: true,
            })

            assert.deepStrictEqual(testCodeGen.generatedFiles, [otherFile])
        })
    })
})
