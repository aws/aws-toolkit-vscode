/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as semver from 'semver'
import * as startSecurityScan from '../../codewhisperer/commands/startSecurityScan'
import { SecurityPanelViewProvider } from '../../codewhisperer/views/securityPanelViewProvider'
import { FakeExtensionContext } from '../fakeExtensionContext'
import * as diagnosticsProvider from '../../codewhisperer/service/diagnosticsProvider'
import { getTestWorkspaceFolder } from '../../testInteg/integrationTestsUtilities'
import { join } from 'path'
import { assertTelemetry, closeAllEditors, getFetchStubWithResponse } from '../testUtil'
import { AWSError } from 'aws-sdk'
import { getTestWindow } from '../shared/vscode/window'
import { SeverityLevel } from '../shared/vscode/message'
import { cancel } from '../../shared/localizedText'
import {
    showScannedFilesMessage,
    stopScanMessage,
    CodeAnalysisScope,
    monthlyLimitReachedNotification,
    scansLimitReachedErrorMessage,
} from '../../codewhisperer/models/constants'
import * as model from '../../codewhisperer/models/model'
import * as errors from '../../shared/errors'
import * as timeoutUtils from '../../shared/utilities/timeoutUtils'
import { AuthUtil, SecurityIssueTreeViewProvider } from '../../codewhisperer'
import { createClient, mockGetCodeScanResponse } from './testUtil'
import { LanguageClientAuth } from '../../auth/auth2'

let extensionContext: FakeExtensionContext
let mockSecurityPanelViewProvider: SecurityPanelViewProvider
let appRoot: string
let appCodePath: string
let editor: vscode.TextEditor
let focusStub: sinon.SinonStub

describe('startSecurityScan', function () {
    const workspaceFolder = getTestWorkspaceFolder()

    before(async function () {
        const mockLspAuth: Partial<LanguageClientAuth> = {
            registerSsoTokenChangedHandler: sinon.stub().resolves(),
        }
        AuthUtil.create(mockLspAuth as LanguageClientAuth)
    })

    beforeEach(async function () {
        extensionContext = await FakeExtensionContext.create()
        mockSecurityPanelViewProvider = new SecurityPanelViewProvider(extensionContext)
        appRoot = join(workspaceFolder, 'python3.7-plain-sam-app')
        appCodePath = join(appRoot, 'hello_world', 'app.py')
        editor = await openTestFile(appCodePath)
        await model.CodeScansState.instance.setScansEnabled(false)
        sinon.stub(timeoutUtils, 'sleep')
        focusStub = sinon.stub(SecurityIssueTreeViewProvider, 'focus')
    })

    afterEach(function () {
        sinon.restore()
    })

    after(async function () {
        await closeAllEditors()
    })

    const openTestFile = async (filePath: string) => {
        const doc = await vscode.workspace.openTextDocument(filePath)
        return await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
        })
    }

    it('Should render security scan result', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')

        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.PROJECT,
            true
        )
        assert.ok(focusStub.calledOnce)
        assert.ok(securityScanRenderSpy.calledOnce)
        const warnings = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Warning)
        assert.strictEqual(warnings.length, 0)
    })

    it('Should render security scan result for on-demand file scan', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const commandSpy = sinon.spy(vscode.commands, 'executeCommand')
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')

        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE_ON_DEMAND,
            true
        )
        assert.ok(commandSpy.neverCalledWith('workbench.action.problems.focus'))
        assert.ok(securityScanRenderSpy.calledOnce)
        const warnings = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Warning)
        assert.strictEqual(warnings.length, 0)
    })

    it('Should not focus problems panel for file scans', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')

        await model.CodeScansState.instance.setScansEnabled(true)
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE_AUTO,
            false
        )
        assert.ok(focusStub.notCalled)
        assert.ok(securityScanRenderSpy.calledOnce)
        const warnings = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Warning)
        assert.strictEqual(warnings.length, 0)
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanScope: 'FILE_AUTO',
            passive: true,
        })
    })

    it('Should stop security scan for project scans when confirmed', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')
        const securityScanStoppedErrorSpy = sinon.spy(model, 'CodeScanStoppedError')
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage((message) => {
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
            CodeAnalysisScope.PROJECT,
            false
        )
        await startSecurityScan.confirmStopSecurityScan(
            model.codeScanState,
            false,
            CodeAnalysisScope.PROJECT,
            undefined
        )
        await scanPromise
        assert.ok(securityScanRenderSpy.notCalled)
        assert.ok(securityScanStoppedErrorSpy.calledOnce)
        const warnings = testWindow.shownMessages.filter((m) => m.severity === SeverityLevel.Warning)
        assert.ok(warnings.map((m) => m.message).includes(stopScanMessage))
    })

    it('Should not stop security scan for project scans when not confirmed', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')
        const securityScanStoppedErrorSpy = sinon.spy(model, 'CodeScanStoppedError')
        const testWindow = getTestWindow()
        testWindow.onDidShowMessage((message) => {
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
            CodeAnalysisScope.PROJECT,
            false
        )
        await startSecurityScan.confirmStopSecurityScan(
            model.codeScanState,
            false,
            CodeAnalysisScope.PROJECT,
            undefined
        )
        await scanPromise
        assert.ok(securityScanRenderSpy.calledOnce)
        assert.ok(securityScanStoppedErrorSpy.notCalled)
        const warnings = testWindow.shownMessages.filter((m) => m.severity === SeverityLevel.Warning)
        assert.ok(warnings.map((m) => m.message).includes(stopScanMessage))
    })

    it('Should stop security scan for auto file scans if setting is disabled', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')
        const securityScanStoppedErrorSpy = sinon.spy(model, 'CodeScanStoppedError')
        await model.CodeScansState.instance.setScansEnabled(true)
        const scanPromise = startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE_AUTO,
            false
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
        testWindow.onDidShowMessage((message) => {
            if (message.message.includes('Security scan completed')) {
                message.selectItem(showScannedFilesMessage)
            }
        })
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.PROJECT,
            false
        )
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanTotalIssues: 1,
            codewhispererCodeScanIssuesWithFixes: 0,
            codewhispererCodeScanScope: 'PROJECT',
            passive: false,
        })
        assertTelemetry('codewhisperer_codeScanIssueDetected', {
            autoDetected: false,
            detectorId: 'detectorId',
            findingId: 'findingId',
        })
    })

    it('Should cancel a scan if a newer one has started', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        await model.CodeScansState.instance.setScansEnabled(true)

        const scanPromise = startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE_AUTO,
            false
        )
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE_AUTO,
            false
        )
        await scanPromise
        assertTelemetry('codewhisperer_securityScan', [
            {
                result: 'Cancelled',
                reasonDesc: 'Security scan stopped by user.',
                reason: 'DefaultError',
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
            CodeAnalysisScope.PROJECT,
            false
        )
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext,
            CodeAnalysisScope.FILE_AUTO,
            false
        )
        await scanPromise
        assertTelemetry('codewhisperer_securityScan', [
            {
                result: 'Succeeded',
                codewhispererCodeScanScope: 'FILE_AUTO',
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
            CodeAnalysisScope.PROJECT,
            false
        )
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanScope: 'PROJECT',
            result: 'Failed',
            reason: 'CodeScanJobFailedError',
            reasonDesc: 'CodeScanJobFailedError: Security scan failed.',
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
            message: scansLimitReachedErrorMessage,
        } satisfies AWSError)
        sinon.stub(errors, 'isAwsError').returns(true)
        const testWindow = getTestWindow()
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            mockClient,
            extensionContext,
            CodeAnalysisScope.PROJECT,
            false
        )

        assert.ok(testWindow.shownMessages.map((m) => m.message).includes(monthlyLimitReachedNotification))
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanScope: 'PROJECT',
            result: 'Failed',
            reason: 'ThrottlingException',
            reasonDesc: `ThrottlingException: Maximum com.amazon.aws.codewhisperer.StartCodeAnalysis reached for this month.`,
            passive: false,
        })
    })

    it('Should set monthly quota exceeded when throttled for auto file scans', async function () {
        getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
        await model.CodeScansState.instance.setScansEnabled(true)
        const mockClient = createClient()
        mockClient.createCodeScan.throws({
            code: 'ThrottlingException',
            time: new Date(),
            name: 'error name',
            message: 'Maximum file scans count reached for this month',
        } satisfies AWSError)
        sinon.stub(errors, 'isAwsError').returns(true)
        assert.equal(model.CodeScansState.instance.isMonthlyQuotaExceeded(), false)
        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            mockClient,
            extensionContext,
            CodeAnalysisScope.FILE_AUTO,
            false
        )
        assert.equal(model.CodeScansState.instance.isMonthlyQuotaExceeded(), true)
        const warnings = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Warning)
        assert.strictEqual(warnings.length, 0)
        assertTelemetry('codewhisperer_securityScan', {
            codewhispererCodeScanScope: 'FILE_AUTO',
            result: 'Failed',
            reason: 'ThrottlingException',
            reasonDesc: 'ThrottlingException: Maximum file scans count reached for this month',
            passive: true,
        })
    })
})
