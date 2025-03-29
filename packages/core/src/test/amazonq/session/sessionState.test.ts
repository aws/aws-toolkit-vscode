/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import sinon from 'sinon'
import { CodeGenBase } from '../../../amazonq/session/sessionState'
import { RunCommandLogFileName } from '../../../amazonq/session/sessionState'
import assert from 'assert'
import * as workspaceUtils from '../../../shared/utilities/workspaceUtils'
import * as loggerModule from '../../../shared/logger/logger'
import { TelemetryHelper } from '../../../amazonq/util/telemetryHelper'

describe('CodeGenBase generateCode log file handling', () => {
    class TestCodeGen extends CodeGenBase {
        public generatedFiles: any[] = []
        constructor(config: any, tabID: string) {
            super(config, tabID)
        }
        protected handleProgress(_messenger: any): void {
            // No-op for test.
        }
        protected getScheme(): string {
            return 'file'
        }
        protected getTimeoutErrorCode(): string {
            return 'test_timeout'
        }
        protected handleGenerationComplete(_messenger: any, newFileInfo: any[]): void {
            this.generatedFiles = newFileInfo
        }
        protected handleError(_messenger: any, _codegenResult: any): Error {
            throw new Error('handleError called')
        }
    }

    let fakeProxyClient: any
    let testConfig: any
    let fsMock: any
    let messengerMock: any
    let loggerMock: any
    let testAction: any

    beforeEach(async () => {
        const ret = {
            testworkspacefolder: {
                uri: vscode.Uri.file('/path/to/testworkspacefolder'),
                name: 'testworkspacefolder',
                index: 0,
            },
        }
        sinon.stub(workspaceUtils, 'getWorkspaceFoldersByPrefixes').returns(ret)

        fakeProxyClient = {
            getCodeGeneration: sinon.stub().resolves({
                codeGenerationStatus: { status: 'Complete' },
                codeGenerationRemainingIterationCount: 0,
                codeGenerationTotalIterationCount: 1,
            }),
            exportResultArchive: sinon.stub(),
        }

        testConfig = {
            conversationId: 'conv_test',
            uploadId: 'upload_test',
            workspaceRoots: ['/path/to/testworkspacefolder'],
            proxyClient: fakeProxyClient,
        }

        fsMock = {
            writeFile: sinon.stub().resolves(),
            registerProvider: sinon.stub().resolves(),
        }

        messengerMock = { sendAnswer: sinon.spy() }

        loggerMock = {
            info: sinon.spy(),
        }

        testAction = {
            fs: fsMock,
            messenger: messengerMock,
            logger: loggerMock,
            tokenSource: {
                token: {
                    isCancellationRequested: false,
                    onCancellationRequested: () => {},
                },
            },
        }
    })

    afterEach(() => {
        sinon.restore()
    })

    it('adds the log content to logger if present and excludes it from new files', async () => {
        const logFileInfo = {
            zipFilePath: RunCommandLogFileName,
            fileContent: 'Log content',
        }
        const otherFile = { zipFilePath: 'other.ts', fileContent: 'other content' }
        fakeProxyClient.exportResultArchive.resolves({
            newFileContents: [logFileInfo, otherFile],
            deletedFiles: [],
            references: [],
        })
        const controlledLogger = {
            info: sinon.spy(),
            debug: sinon.spy(),
            verbose: sinon.spy(),
            warn: sinon.spy(),
            error: sinon.spy(),
            log: sinon.spy(),
            setLogLevel: sinon.spy(),
            setLogLevelToDefault: sinon.spy(),
            logLevelEnabled: sinon.spy(),
            getLogById: sinon.spy(),
            sendToLog: sinon.spy(),
        }
        sinon.stub(loggerModule, 'getLogger').returns(controlledLogger)
        const testCodeGen = new TestCodeGen(testConfig, 'tab1')

        const result = await testCodeGen.generateCode({
            messenger: messengerMock,
            fs: fsMock,
            codeGenerationId: 'codegen1',
            telemetry: new TelemetryHelper(),
            workspaceFolders: [testConfig.workspaceRoots[0]],
            action: testAction,
        })

        sinon.assert.calledWith(controlledLogger.info, sinon.match(`sessionState: Run Command logs, Log content`))

        const expectedNewFile = {
            zipFilePath: 'other.ts',
            fileContent: 'other content',
            changeApplied: false,
            rejected: false,
            relativePath: 'other.ts',
            virtualMemoryUri: vscode.Uri.file(`/upload_test/other.ts`),
            workspaceFolder: {
                index: 0,
                name: 'testworkspacefolder',
                uri: vscode.Uri.file('/path/to/testworkspacefolder'),
            },
        }
        assert.deepStrictEqual(result.newFiles[0].fileContent, expectedNewFile.fileContent)
    })

    it('skips log file handling if log file is not present', async () => {
        const file1 = { zipFilePath: 'file1.ts', fileContent: 'content1' }
        fakeProxyClient.exportResultArchive.resolves({
            newFileContents: [file1],
            deletedFiles: [],
            references: [],
        })

        const testCodeGen = new TestCodeGen(testConfig, 'tab1')

        const result = await testCodeGen.generateCode({
            messenger: messengerMock,
            fs: fsMock,
            codeGenerationId: 'codegen2',
            telemetry: new TelemetryHelper(),
            workspaceFolders: [testConfig.workspaceRoots[0]],
            action: testAction,
        })

        sinon.assert.notCalled(loggerMock.info)

        const expectedNewFile = {
            zipFilePath: 'file1.ts',
            fileContent: 'content1',
            changeApplied: false,
            rejected: false,
            relativePath: 'file1.ts',
            virtualMemoryUri: vscode.Uri.file(`/upload_test/file1.ts`),
            workspaceFolder: {
                index: 0,
                name: 'testworkspacefolder',
                uri: vscode.Uri.file('/path/to/testworkspacefolder'),
            },
        }
        assert.deepStrictEqual(result.newFiles[0].fileContent, expectedNewFile.fileContent)
    })
})
