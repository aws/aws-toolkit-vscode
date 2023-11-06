/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import * as sinon from 'sinon'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { createCodeScanIssue, createMockDocument, resetCodeWhispererGlobalVariables } from '../testUtil'
import { assertTelemetry, assertTelemetryCurried } from '../../testUtil'
import {
    toggleCodeSuggestions,
    showSecurityScan,
    applySecurityFix,
} from '../../../codewhisperer/commands/basicCommands'
import { FakeMemento, FakeExtensionContext } from '../../fakeExtensionContext'
import { testCommand } from '../../shared/vscode/testUtils'
import { Command } from '../../../shared/vscode/commands2'
import { SecurityPanelViewProvider } from '../../../codewhisperer/views/securityPanelViewProvider'
import { DefaultCodeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import { stub } from '../../utilities/stubber'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { ExtContext } from '../../../shared/extensions'
import { get, set } from '../../../codewhisperer/util/commonUtil'
import { MockDocument } from '../../fake/fakeDocument'
import { FileSystemCommon } from '../../../srcShared/fs'
import { getLogger } from '../../../shared/logger/logger'

describe('CodeWhisperer-basicCommands', function () {
    let targetCommand: Command<any> & vscode.Disposable

    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })

    afterEach(function () {
        targetCommand?.dispose()
        sinon.restore()
    })

    it('test get()', async function () {
        const fakeMemeto = new FakeMemento()
        fakeMemeto.update(CodeWhispererConstants.autoTriggerEnabledKey, true)

        let res = get(CodeWhispererConstants.autoTriggerEnabledKey, fakeMemeto)
        assert.strictEqual(res, true)

        fakeMemeto.update(CodeWhispererConstants.autoTriggerEnabledKey, undefined)
        res = get(CodeWhispererConstants.autoTriggerEnabledKey, fakeMemeto)
        assert.strictEqual(res, undefined)

        fakeMemeto.update(CodeWhispererConstants.autoTriggerEnabledKey, false)
        res = get(CodeWhispererConstants.autoTriggerEnabledKey, fakeMemeto)
        assert.strictEqual(res, false)
    })

    it('test set()', async function () {
        const fakeMemeto = new FakeMemento()
        set(CodeWhispererConstants.autoTriggerEnabledKey, true, fakeMemeto)
        assert.strictEqual(fakeMemeto.get(CodeWhispererConstants.autoTriggerEnabledKey), true)

        set(CodeWhispererConstants.autoTriggerEnabledKey, false, fakeMemeto)
        assert.strictEqual(fakeMemeto.get(CodeWhispererConstants.autoTriggerEnabledKey), false)
    })

    describe('toggleCodeSuggestion', function () {
        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        it('should emit aws_modifySetting event on user toggling autoSuggestion - deactivate', async function () {
            const fakeMemeto = new FakeMemento()
            targetCommand = testCommand(toggleCodeSuggestions, fakeMemeto)
            fakeMemeto.update(CodeWhispererConstants.autoTriggerEnabledKey, true)
            assert.strictEqual(fakeMemeto.get(CodeWhispererConstants.autoTriggerEnabledKey), true)

            await targetCommand.execute()
            const res = fakeMemeto.get(CodeWhispererConstants.autoTriggerEnabledKey)
            assert.strictEqual(res, false)
            assertTelemetryCurried('aws_modifySetting')({
                settingId: CodeWhispererConstants.autoSuggestionConfig.settingId,
                settingState: CodeWhispererConstants.autoSuggestionConfig.deactivated,
            })
        })

        it('should emit aws_modifySetting event on user toggling autoSuggestion -- activate', async function () {
            const fakeMemeto = new FakeMemento()
            targetCommand = testCommand(toggleCodeSuggestions, fakeMemeto)

            assert.strictEqual(fakeMemeto.get(CodeWhispererConstants.autoTriggerEnabledKey), undefined)
            await targetCommand.execute()
            const res = fakeMemeto.get(CodeWhispererConstants.autoTriggerEnabledKey)
            assert.strictEqual(res, true)
            assertTelemetryCurried('aws_modifySetting')({
                settingId: CodeWhispererConstants.autoSuggestionConfig.settingId,
                settingState: CodeWhispererConstants.autoSuggestionConfig.activated,
            })
        })
    })

    describe('showSecurityScan', function () {
        let mockExtensionContext: vscode.ExtensionContext
        let mockSecurityPanelViewProvider: SecurityPanelViewProvider
        let mockClient: DefaultCodeWhispererClient
        let mockExtContext: ExtContext

        beforeEach(async function () {
            resetCodeWhispererGlobalVariables()
            mockExtensionContext = await FakeExtensionContext.create()
            mockSecurityPanelViewProvider = new SecurityPanelViewProvider(mockExtensionContext)
            mockClient = stub(DefaultCodeWhispererClient)
            mockExtContext = await FakeExtensionContext.getFakeExtContext()
        })

        afterEach(function () {
            targetCommand?.dispose()
            sinon.restore()
        })

        it('prompts user to reauthenticate if connection is expired', async function () {
            targetCommand = testCommand(showSecurityScan, mockExtContext, mockSecurityPanelViewProvider, mockClient)

            sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(true)
            const spy = sinon.stub(AuthUtil.instance, 'showReauthenticatePrompt')

            await targetCommand.execute()
            assert.ok(spy.called)
        })

        it('shows information message if there is no active text editor', async function () {
            targetCommand = testCommand(showSecurityScan, mockExtContext, mockSecurityPanelViewProvider, mockClient)

            sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)

            assert.ok(vscode.window.activeTextEditor === undefined)
            await targetCommand.execute()
            assert.strictEqual(getTestWindow().shownMessages[0].message, 'Open a valid file to scan.')
        })
    })

    describe('applySecurityFix', function () {
        let sandbox: sinon.SinonSandbox
        let saveStub: sinon.SinonStub
        let openTextDocumentMock: sinon.SinonStub
        let writeFileMock: sinon.SinonStub

        beforeEach(function () {
            sandbox = sinon.createSandbox()
            saveStub = sinon.stub()
            openTextDocumentMock = sinon.stub()
            writeFileMock = sinon.stub()
        })

        afterEach(function () {
            sandbox.restore()
        })

        it('should call applySecurityFix command successfully', async function () {
            const fileName = 'sample.py'
            saveStub.resolves(true)
            const textDocumentMock = new MockDocument('first line\n second line\n fourth line', fileName, saveStub)

            openTextDocumentMock.resolves(textDocumentMock)
            sandbox.stub(vscode.workspace, 'openTextDocument').value(openTextDocumentMock)

            writeFileMock.resolves(true)
            sinon.stub(FileSystemCommon.prototype, 'writeFile').value(writeFileMock)

            targetCommand = testCommand(applySecurityFix)
            const codeScanIssue = createCodeScanIssue({
                suggestedFixes: [
                    {
                        description: 'fix',
                        code: '@@ -1,3 +1,3 @@\n first line\n- second line\n+ third line\n  fourth line',
                    },
                ],
            })
            await targetCommand.execute(codeScanIssue, fileName, 'hover')
            assert.ok(saveStub.calledOnce)
            assert.ok(writeFileMock.calledOnceWith(fileName, 'first line\n third line\n fourth line'))

            assert.strictEqual(
                getTestWindow().shownMessages[0].message,
                'Code fix was applied. Run a security scan to validate the fix.'
            )
            assertTelemetry('codewhisperer_codeScanIssueApplyFix', {
                detectorId: codeScanIssue.detectorId,
                findingId: codeScanIssue.findingId,
                component: 'hover',
                result: 'Succeeded',
            })
        })

        it('handles patch failure', async function () {
            const textDocumentMock = createMockDocument()

            openTextDocumentMock.resolves(textDocumentMock)

            sandbox.stub(vscode.workspace, 'openTextDocument').value(openTextDocumentMock)

            targetCommand = testCommand(applySecurityFix)
            const codeScanIssue = createCodeScanIssue({
                suggestedFixes: [
                    {
                        code: '@@ -1,1 -1,1 @@\n-mock\n+line5',
                        description: 'dummy',
                    },
                ],
            })
            await targetCommand.execute(codeScanIssue, 'test.py', 'webview')

            assert.strictEqual(getTestWindow().shownMessages[0].message, 'Failed to apply suggested code fix.')
            assertTelemetry('codewhisperer_codeScanIssueApplyFix', {
                detectorId: codeScanIssue.detectorId,
                findingId: codeScanIssue.findingId,
                component: 'webview',
                result: 'Failed',
                reason: 'Error: Failed to get updated content from applying diff patch',
            })
        })

        it('handles document save failure', async function () {
            const fileName = 'sample.py'
            saveStub.resolves(false)
            const textDocumentMock = new MockDocument('first line\n second line\n fourth line', fileName, saveStub)

            openTextDocumentMock.resolves(textDocumentMock)

            sandbox.stub(vscode.workspace, 'openTextDocument').value(openTextDocumentMock)
            const loggerStub = sinon.stub(getLogger(), 'error')

            targetCommand = testCommand(applySecurityFix)
            const codeScanIssue = createCodeScanIssue({
                suggestedFixes: [
                    {
                        description: 'fix',
                        code: '@@ -1,3 +1,3 @@\n first line\n- second line\n+ third line\n  fourth line',
                    },
                ],
            })
            await targetCommand.execute(codeScanIssue, fileName, 'quickfix')

            assert.ok(saveStub.calledOnce)
            assert.ok(loggerStub.calledOnce)
            const actual = loggerStub.getCall(0).args[0]
            assert.strictEqual(
                actual,
                'Apply fix command failed. Error: Failed to save editor text changes into the file.'
            )
            assertTelemetry('codewhisperer_codeScanIssueApplyFix', {
                detectorId: codeScanIssue.detectorId,
                findingId: codeScanIssue.findingId,
                component: 'quickfix',
                result: 'Failed',
                reason: 'Error: Failed to save editor text changes into the file.',
            })
        })

        it('handles document write failure', async function () {
            const fileName = 'sample.py'
            saveStub.resolves(true)
            const textDocumentMock = new MockDocument('first line\n second line\n fourth line', fileName, saveStub)

            openTextDocumentMock.resolves(textDocumentMock)
            writeFileMock.rejects('Error: Writing to file failed.')

            sandbox.stub(vscode.workspace, 'openTextDocument').value(openTextDocumentMock)
            sinon.stub(FileSystemCommon.prototype, 'writeFile').value(writeFileMock)
            const loggerStub = sinon.stub(getLogger(), 'error')

            targetCommand = testCommand(applySecurityFix)
            const codeScanIssue = createCodeScanIssue({
                suggestedFixes: [
                    {
                        description: 'fix',
                        code: '@@ -1,3 +1,3 @@\n first line\n- second line\n+ third line\n  fourth line',
                    },
                ],
            })
            await targetCommand.execute(codeScanIssue, fileName, 'hover')

            assert.ok(saveStub.calledOnce)
            assert.ok(loggerStub.calledOnce)
            const actual = loggerStub.getCall(0).args[0]
            assert.strictEqual(actual, 'Apply fix command failed. Error: Writing to file failed.')
            assertTelemetry('codewhisperer_codeScanIssueApplyFix', {
                detectorId: codeScanIssue.detectorId,
                findingId: codeScanIssue.findingId,
                component: 'hover',
                result: 'Failed',
                reason: 'Error: Writing to file failed.',
            })
        })
    })
})
