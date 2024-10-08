/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as startSecurityScan from '../../codewhisperer/commands/startSecurityScan'
import * as diagnosticsProvider from '../../codewhisperer/service/diagnosticsProvider'
import * as model from '../../codewhisperer/models/model'
import * as timeoutUtils from '../../shared/utilities/timeoutUtils'
import assert from 'assert'
import { DefaultCodeWhispererClient } from '../../codewhisperer'
import { SecurityPanelViewProvider } from '../../codewhisperer/views/securityPanelViewProvider'
import { FakeExtensionContext } from '../../test/fakeExtensionContext'
import { join } from 'path'
import {
    assertTelemetry,
    closeAllEditors,
    createTestWorkspaceFolder,
    getFetchStubWithResponse,
    toFile,
} from '../../test/testUtil'
import { stub } from '../../test/utilities/stubber'
import { HttpResponse } from 'aws-sdk'
import { getTestWindow } from '../../test/shared/vscode/window'
import { SeverityLevel } from '../../test/shared/vscode/message'
import { CodeAnalysisScope } from '../../codewhisperer'
import { performanceTest } from '../../shared/performance/performance'

const mockCreateCodeScanResponse = {
    $response: {
        data: {
            jobId: 'jobId',
            status: 'Pending',
        },
        requestId: 'requestId',
        hasNextPage: () => false,
        error: undefined,
        nextPage: () => undefined,
        redirectCount: 0,
        retryCount: 0,
        httpResponse: new HttpResponse(),
    },
    jobId: 'jobId',
    status: 'Pending',
}

const mockCreateUploadUrlResponse = {
    $response: {
        data: {
            uploadId: 'uploadId',
            uploadUrl: 'uploadUrl',
        },
        requestId: 'requestId',
        hasNextPage: () => false,
        error: undefined,
        nextPage: () => undefined,
        redirectCount: 0,
        retryCount: 0,
        httpResponse: new HttpResponse(),
    },
    uploadId: 'uploadId',
    uploadUrl: 'https://test.com',
}

const mockGetCodeScanResponse = {
    $response: {
        data: {
            status: 'Completed',
        },
        requestId: 'requestId',
        hasNextPage: () => false,
        error: undefined,
        nextPage: () => undefined,
        redirectCount: 0,
        retryCount: 0,
        httpResponse: new HttpResponse(),
    },
    status: 'Completed',
}

const mockCodeScanFindings = JSON.stringify([
    {
        filePath: 'workspaceFolder/python3.7-plain-sam-app/hello_world/app.py',
        startLine: 1,
        endLine: 1,
        title: 'title',
        description: {
            text: 'text',
            markdown: 'markdown',
        },
        detectorId: 'detectorId',
        detectorName: 'detectorName',
        findingId: 'findingId',
        relatedVulnerabilities: [],
        severity: 'High',
        remediation: {
            recommendation: {
                text: 'text',
                url: 'url',
            },
            suggestedFixes: [],
        },
        codeSnippet: [],
    } satisfies model.RawCodeScanIssue,
])

const mockListCodeScanFindingsResponse = {
    $response: {
        data: {
            codeScanFindings: mockCodeScanFindings,
        },
        requestId: 'requestId',
        hasNextPage: () => false,
        error: undefined,
        nextPage: () => undefined,
        redirectCount: 0,
        retryCount: 0,
        httpResponse: new HttpResponse(),
    },
    codeScanFindings: mockCodeScanFindings,
}

describe('startSecurityScanPerformanceTest', function () {
    let extensionContext: FakeExtensionContext
    let mockSecurityPanelViewProvider: SecurityPanelViewProvider
    let appCodePath: string
    let editor: vscode.TextEditor
    beforeEach(async function () {
        extensionContext = await FakeExtensionContext.create()
        mockSecurityPanelViewProvider = new SecurityPanelViewProvider(extensionContext)
        const folder = await createTestWorkspaceFolder()
        const mockFilePath = join(folder.uri.fsPath, 'app.py')
        await toFile('hello_world', mockFilePath)
        appCodePath = mockFilePath
        editor = await openTestFile(appCodePath)
        await model.CodeScansState.instance.setScansEnabled(false)
        sinon.stub(timeoutUtils, 'sleep')
    })

    afterEach(function () {
        sinon.restore()
    })

    after(async function () {
        await closeAllEditors()
    })

    const createClient = () => {
        const mockClient = stub(DefaultCodeWhispererClient)
        mockClient.createCodeScan.resolves(mockCreateCodeScanResponse)
        mockClient.createUploadUrl.resolves(mockCreateUploadUrlResponse)
        mockClient.getCodeScan.resolves(mockGetCodeScanResponse)
        mockClient.listCodeScanFindings.resolves(mockListCodeScanFindingsResponse)
        return mockClient
    }

    const openTestFile = async (filePath: string) => {
        const doc = await vscode.workspace.openTextDocument(filePath)
        return await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
        })
    }

    performanceTest({}, 'Should calculate cpu and memory usage for file scans', function () {
        return {
            setup: async () => {
                getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
                const commandSpy = sinon.spy(vscode.commands, 'executeCommand')
                const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')
                await model.CodeScansState.instance.setScansEnabled(true)
                return { commandSpy, securityScanRenderSpy }
            },
            execute: async () => {
                await startSecurityScan.startSecurityScan(
                    mockSecurityPanelViewProvider,
                    editor,
                    createClient(),
                    extensionContext,
                    CodeAnalysisScope.FILE
                )
            },
            verify: ({
                commandSpy,
                securityScanRenderSpy,
            }: {
                commandSpy: sinon.SinonSpy
                securityScanRenderSpy: sinon.SinonSpy
            }) => {
                assert.ok(commandSpy.neverCalledWith('workbench.action.problems.focus'))
                assert.ok(securityScanRenderSpy.calledOnce)
                const warnings = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Warning)
                assert.strictEqual(warnings.length, 0)
                assertTelemetry('codewhisperer_securityScan', {
                    codewhispererCodeScanScope: 'FILE',
                    passive: true,
                })
            },
        }
    })
})
