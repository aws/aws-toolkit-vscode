/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as semver from 'semver'
import { DefaultCodeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import * as startSecurityScan from '../../../codewhisperer/commands/startSecurityScan'
import { SecurityPanelViewProvider } from '../../../codewhisperer/views/securityPanelViewProvider'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import * as diagnosticsProvider from '../../../codewhisperer/service/diagnosticsProvider'
import { getTestWorkspaceFolder } from '../../../testInteg/integrationTestsUtilities'
import { join } from 'path'
import { assertTelemetry, closeAllEditors } from '../../testUtil'
import { stub } from '../../utilities/stubber'
import { AWSError, HttpResponse } from 'aws-sdk'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'
import { cancel } from '../../../shared/localizedText'
import {
    showScannedFilesMessage,
    stopScanMessage,
    CodeAnalysisScope,
    projectScansLimitReached,
} from '../../../codewhisperer/models/constants'
import * as model from '../../../codewhisperer/models/model'
import { CodewhispererSecurityScan } from '../../../shared/telemetry/telemetry.gen'
import { getFetchStubWithResponse } from '../../common/request.test'
import * as errors from '../../../shared/errors'
import * as timeoutUtils from '../../../shared/utilities/timeoutUtils'

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

let extensionContext: FakeExtensionContext
let mockSecurityPanelViewProvider: SecurityPanelViewProvider
let appRoot: string
let appCodePath: string
let editor: vscode.TextEditor

describe('startSecurityScan', function () {
    const workspaceFolder = getTestWorkspaceFolder()

    beforeEach(async function () {
        extensionContext = await FakeExtensionContext.create()
        mockSecurityPanelViewProvider = new SecurityPanelViewProvider(extensionContext)
        appRoot = join(workspaceFolder, 'python3.7-plain-sam-app')
        appCodePath = join(appRoot, 'hello_world', 'app.py')
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

    it('Should render security scan result', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const commandSpy = sinon.spy(vscode.commands, 'executeCommand')
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')

        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.PROJECT
        )
        assert.ok(commandSpy.calledWith('workbench.action.problems.focus'))
        assert.ok(securityScanRenderSpy.calledOnce)
        const warnings = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Warning)
        assert.strictEqual(warnings.length, 0)
    })

    it('Should not focus problems panel for file scans', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const commandSpy = sinon.spy(vscode.commands, 'executeCommand')
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')

        await model.CodeScansState.instance.setScansEnabled(true)
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE
        )
        assert.ok(commandSpy.neverCalledWith('workbench.action.problems.focus'))
        assert.ok(securityScanRenderSpy.calledOnce)
        const warnings = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Warning)
        assert.strictEqual(warnings.length, 0)
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanScope: 'FILE',
            passive: true,
        })
    })

    it('Should stop security scan for project scans when confirmed', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')
        const securityScanStoppedErrorSpy = sinon.spy(model, 'CodeScanStoppedError')
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage(message => {
            if (message.message === stopScanMessage) {
                message.selectItem(startSecurityScan.stopScanButton)
            }
        })
        model.codeScanState.setToRunning()
        const scanPromise = startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.PROJECT
        )
        await startSecurityScan.confirmStopSecurityScan()
        await scanPromise
        assert.ok(securityScanRenderSpy.notCalled)
        assert.ok(securityScanStoppedErrorSpy.calledOnce)
        const warnings = testWindow.shownMessages.filter(m => m.severity === SeverityLevel.Warning)
        assert.ok(warnings.map(m => m.message).includes(stopScanMessage))
    })

    it('Should not stop security scan for project scans when not confirmed', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')
        const securityScanStoppedErrorSpy = sinon.spy(model, 'CodeScanStoppedError')
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage(message => {
            if (message.message === stopScanMessage) {
                message.selectItem(cancel)
            }
        })
        model.codeScanState.setToRunning()
        const scanPromise = startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.PROJECT
        )
        await startSecurityScan.confirmStopSecurityScan()
        await scanPromise
        assert.ok(securityScanRenderSpy.calledOnce)
        assert.ok(securityScanStoppedErrorSpy.notCalled)
        const warnings = testWindow.shownMessages.filter(m => m.severity === SeverityLevel.Warning)
        assert.ok(warnings.map(m => m.message).includes(stopScanMessage))
    })

    it('Should stop security scan for file scans if setting is disabled', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')
        const securityScanStoppedErrorSpy = sinon.spy(model, 'CodeScanStoppedError')
        await model.CodeScansState.instance.setScansEnabled(true)
        const scanPromise = startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE
        )
        await model.CodeScansState.instance.setScansEnabled(false)
        await scanPromise
        assert.ok(securityScanRenderSpy.notCalled)
        assert.ok(securityScanStoppedErrorSpy.calledOnce)
    })

    it('Should highlight files after scan is completed', async function () {
        if (semver.lt(vscode.version, '1.78.0')) {
            this.skip()
        }
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage(message => {
            if (message.message.includes('Security scan completed')) {
                message.selectItem(showScannedFilesMessage)
            }
        })
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.PROJECT
        )
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanTotalIssues: 1,
            codewhispererCodeScanIssuesWithFixes: 0,
            codewhispererCodeScanScope: 'PROJECT',
            passive: false,
        } as CodewhispererSecurityScan)
    })

    it('Should cancel a scan if a newer one has started', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        await model.CodeScansState.instance.setScansEnabled(true)

        const scanPromise = startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE
        )
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE
        )
        await scanPromise
        assertTelemetry('codewhisperer_securityScan', [
            {
                result: 'Cancelled',
                reason: 'Security scan stopped by user.',
            },
            {
                result: 'Succeeded',
            },
        ])
    })

    it('Should not cancel a project scan if a file scan has started', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        await model.CodeScansState.instance.setScansEnabled(true)

        const scanPromise = startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.PROJECT
        )
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE
        )
        await scanPromise
        assertTelemetry('codewhisperer_securityScan', [
            {
                result: 'Succeeded',
                codewhispererCodeScanScope: 'FILE',
            },
            {
                result: 'Succeeded',
                codewhispererCodeScanScope: 'PROJECT',
            },
        ])
    })

    it('Should handle failed scan job status', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })

        const mockClient = createClient()
        mockClient.getCodeScan.resolves({
            ...mockGetCodeScanResponse,
            status: 'Failed',
        })
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            mockClient,
            extensionContext,
            CodeAnalysisScope.PROJECT
        )
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanScope: 'PROJECT',
            result: 'Failed',
            reason: 'Security scan job failed.',
            passive: false,
        })
    })

    it('Should show notification when throttled for project scans', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const mockClient = createClient()
        mockClient.createCodeScan.throws({
            code: 'ThrottlingException',
            time: new Date(),
            name: 'error name',
            message: 'Maximum project scan count reached for this month.',
        } satisfies AWSError)
        sinon.stub(errors, 'isAwsError').returns(true)
        const testWindow = getTestWindow()
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            mockClient,
            extensionContext,
            CodeAnalysisScope.PROJECT
        )
        assert.ok(testWindow.shownMessages.map(m => m.message).includes(projectScansLimitReached))
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanScope: 'PROJECT',
            result: 'Failed',
            reason: 'Maximum project scan count reached for this month.',
            passive: false,
        } as CodewhispererSecurityScan)
    })

    it('Should set monthly quota exceeded when throttled for file scans', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        await model.CodeScansState.instance.setScansEnabled(true)
        const mockClient = createClient()
        mockClient.createCodeScan.throws({
            code: 'ThrottlingException',
            time: new Date(),
            name: 'error name',
            message: 'Maximum auto-scans count reached for this month.',
        } satisfies AWSError)
        sinon.stub(errors, 'isAwsError').returns(true)
        assert.equal(model.CodeScansState.instance.isMonthlyQuotaExceeded(), false)
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            mockClient,
            extensionContext,
            CodeAnalysisScope.FILE
        )
        assert.equal(model.CodeScansState.instance.isMonthlyQuotaExceeded(), true)
        const warnings = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Warning)
        assert.strictEqual(warnings.length, 0)
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanScope: 'FILE',
            result: 'Failed',
            reason: 'Maximum auto-scans count reached for this month.',
            passive: true,
        } as CodewhispererSecurityScan)
    })
})
