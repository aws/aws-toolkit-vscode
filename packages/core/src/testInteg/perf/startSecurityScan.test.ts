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
import { getTestWindow } from '../../test/shared/vscode/window'
import { SeverityLevel } from '../../test/shared/vscode/message'
import { CodeAnalysisScope, ZipUtil } from '../../codewhisperer'
import { getEqualOSTestOptions, performanceTest } from '../../shared/performance/performance'
import { createClient } from '../../test/codewhisperer/testUtil'
import { fs } from '../../shared'
import { FileSystem } from '../../shared/fs/fs'
import { getFsCallsUpperBound } from './utilities'

interface SetupResult {
    commandSpy: sinon.SinonSpy
    securityScanRenderSpy: sinon.SinonSpy
    zipUtil: ZipUtil
    zipSpy: sinon.SinonSpiedInstance<ZipUtil>
    fsSpy: sinon.SinonSpiedInstance<FileSystem>
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

    const openTestFile = async (filePath: string) => {
        const doc = await vscode.workspace.openTextDocument(filePath)
        return await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
        })
    }

    performanceTest(
        getEqualOSTestOptions({
            userCpuUsage: 150,
            systemCpuUsage: 35,
            heapTotal: 2,
        }),
        'Should calculate cpu and memory usage for file scans',
        function () {
            return {
                setup: async () => {
                    getFetchStubWithResponse({ status: 200, statusText: 'testing stub' })
                    const commandSpy = sinon.spy(vscode.commands, 'executeCommand')
                    const securityScanRenderSpy = sinon.spy(diagnosticsProvider, 'initSecurityScanRender')
                    const zipUtil = new ZipUtil()
                    const zipSpy = sinon.spy(zipUtil)
                    const fsSpy = sinon.spy(fs)
                    await model.CodeScansState.instance.setScansEnabled(true)
                    return { commandSpy, securityScanRenderSpy, zipUtil, zipSpy, fsSpy }
                },
                execute: async (setup: SetupResult) => {
                    await startSecurityScan.startSecurityScan(
                        mockSecurityPanelViewProvider,
                        editor,
                        createClient(),
                        extensionContext,
                        CodeAnalysisScope.FILE,
                        setup.zipUtil
                    )
                },
                verify: (setup: SetupResult) => {
                    assert.ok(setup.commandSpy.neverCalledWith('workbench.action.problems.focus'))
                    assert.ok(setup.securityScanRenderSpy.calledOnce)

                    assert.ok(setup.zipSpy.generateZip.calledOnce)
                    assert.ok(setup.zipSpy.removeTmpFiles.calledOnce)
                    assert.ok(
                        getFsCallsUpperBound(setup.fsSpy) <= 5,
                        'should make less than a small constant number of file system calls'
                    )
                    const warnings = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Warning)
                    assert.strictEqual(warnings.length, 0)
                    assertTelemetry('codewhisperer_securityScan', {
                        codewhispererCodeScanScope: 'FILE',
                        passive: true,
                    })
                },
            }
        }
    )
})
