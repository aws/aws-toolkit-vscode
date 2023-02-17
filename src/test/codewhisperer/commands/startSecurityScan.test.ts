/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as got from 'got'
import { DefaultCodeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import * as startSecurityScan from '../../../codewhisperer/commands/startSecurityScan'
import { SecurityPanelViewProvider } from '../../../codewhisperer/views/securityPanelViewProvider'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import * as diagnosticsProvider from '../../../codewhisperer/service/diagnosticsProvider'
import { getTestWorkspaceFolder } from '../../../integrationTest/integrationTestsUtilities'
import { join } from 'path'
import { closeAllEditors } from '../../testUtil'
import { stub } from '../../utilities/stubber'
import { HttpResponse } from 'aws-sdk'
import { getTestWindow } from '../../globalSetup.test'
import { SeverityLevel } from '../../shared/vscode/message'

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
        filePath: '/workspaceFolder/python3.7-plain-sam-app/hello_world/app.py',
        startLine: 1,
        endLine: 1,
        title: 'title',
        description: {
            text: 'text',
            markdown: 'markdown',
        },
    },
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

describe('startSecurityScan', function () {
    const workspaceFolder = getTestWorkspaceFolder()

    afterEach(function () {
        sinon.restore()
    })
    after(function () {
        closeAllEditors()
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

    it('Should prompt warning message if language is not supported', async function () {
        const extensionContext = await FakeExtensionContext.create()
        const mockSecurityPanelViewProvider = new SecurityPanelViewProvider(extensionContext)
        const appRoot = join(workspaceFolder, 'go1-plain-sam-app')
        const appCodePath = join(appRoot, 'hello-world', 'main.go')
        const editor = await openTestFile(appCodePath)

        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            stub(DefaultCodeWhispererClient),
            extensionContext
        )
        const warnings = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Warning)
        assert.strictEqual(warnings.length, 1)
    })

    it('Should render security scan result', async function () {
        const extensionContext = await FakeExtensionContext.create()
        const mockSecurityPanelViewProvider = new SecurityPanelViewProvider(extensionContext)
        const appRoot = join(workspaceFolder, 'python3.7-plain-sam-app')
        const appCodePath = join(appRoot, 'hello_world', 'app.py')
        const editor = await openTestFile(appCodePath)

        sinon.stub(got, 'default').resolves({ statusCode: 200 })
        const commandSpy = sinon.spy(vscode.commands, 'executeCommand')
        const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')
        const warningSpy = sinon.spy(vscode.window, 'showWarningMessage')

        await startSecurityScan.startSecurityScan(
            mockSecurityPanelViewProvider,
            editor,
            createClient(),
            extensionContext
        )
        assert.ok(commandSpy.calledWith('workbench.action.problems.focus'))
        assert.ok(securityScanRenderSpy.calledOnce)
        assert.ok(warningSpy.notCalled)
    })
})
