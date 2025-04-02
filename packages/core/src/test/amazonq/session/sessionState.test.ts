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
import { TelemetryHelper } from '../../../amazonq/util/telemetryHelper'
import { assertLogsContain } from '../../globalSetup.test'

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

        testAction = {
            fs: fsMock,
            messenger: messengerMock,
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

    const runGenerateCode = async (codeGenerationId: string) => {
        const testCodeGen = new TestCodeGen(testConfig, 'tab1')
        return await testCodeGen.generateCode({
            messenger: messengerMock,
            fs: fsMock,
            codeGenerationId,
            telemetry: new TelemetryHelper(),
            workspaceFolders: [testConfig.workspaceRoots[0]],
            action: testAction,
        })
    }

    const createExpectedNewFile = (fileObj: { zipFilePath: string; fileContent: string }) => ({
        zipFilePath: fileObj.zipFilePath,
        fileContent: fileObj.fileContent,
        changeApplied: false,
        rejected: false,
        relativePath: fileObj.zipFilePath,
        virtualMemoryUri: vscode.Uri.file(`/upload_test/${fileObj.zipFilePath}`),
        workspaceFolder: {
            index: 0,
            name: 'testworkspacefolder',
            uri: vscode.Uri.file('/path/to/testworkspacefolder'),
        },
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
        const result = await runGenerateCode('codegen1')

        assertLogsContain(`sessionState: Run Command logs, Log content`, false, 'info')

        const expectedNewFile = createExpectedNewFile(otherFile)
        assert.deepStrictEqual(result.newFiles[0].fileContent, expectedNewFile.fileContent)
    })

    it('skips log file handling if log file is not present', async () => {
        const file1 = { zipFilePath: 'file1.ts', fileContent: 'content1' }
        fakeProxyClient.exportResultArchive.resolves({
            newFileContents: [file1],
            deletedFiles: [],
            references: [],
        })

        const result = await runGenerateCode('codegen2')

        assert.throws(() => assertLogsContain(`sessionState: Run Command logs, Log content`, false, 'info'))

        const expectedNewFile = createExpectedNewFile(file1)
        assert.deepStrictEqual(result.newFiles[0].fileContent, expectedNewFile.fileContent)
    })
})
