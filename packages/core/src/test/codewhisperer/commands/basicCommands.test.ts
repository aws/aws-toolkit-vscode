/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import * as sinon from 'sinon'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { createCodeScanIssue, createMockDocument, resetCodeWhispererGlobalVariables } from '../testUtil'
import { assertTelemetry, assertTelemetryCurried, tryRegister } from '../../testUtil'
import {
    toggleCodeSuggestions,
    showSecurityScan,
    applySecurityFix,
    showReferenceLog,
    selectCustomizationPrompt,
    reconnect,
    signoutCodeWhisperer,
} from '../../../codewhisperer/commands/basicCommands'
import { FakeMemento, FakeExtensionContext } from '../../fakeExtensionContext'
import { testCommand } from '../../shared/vscode/testUtils'
import { Command, placeholder } from '../../../shared/vscode/commands2'
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
import {
    createAutoScans,
    createAutoSuggestions,
    createDocumentationNode,
    createFeedbackNode,
    createGettingStarted,
    createGitHubNode,
    createLearnMore,
    createOpenReferenceLog,
    createReconnect,
    createSecurityScan,
    createSelectCustomization,
    createSettingsNode,
    createSignIn,
    createSignout,
    switchToAmazonQNode,
} from '../../../codewhisperer/ui/codeWhispererNodes'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'
import { listCodeWhispererCommands } from '../../../codewhisperer/ui/statusBarMenu'
import { CodeScansState, CodeSuggestionsState } from '../../../codewhisperer/models/model'
import { cwQuickPickSource } from '../../../codewhisperer/commands/types'
import { isTextEditor } from '../../../shared/utilities/editorUtilities'
import { refreshStatusBar } from '../../../codewhisperer/service/inlineCompletionService'

describe('CodeWhisperer-basicCommands', function () {
    let targetCommand: Command<any> & vscode.Disposable

    before(async function () {
        tryRegister(refreshStatusBar)
    })

    beforeEach(async function () {
        await resetCodeWhispererGlobalVariables()
    })

    afterEach(function () {
        targetCommand?.dispose()
        sinon.restore()
    })

    it('test get()', async function () {
        const fakeMemeto = new FakeMemento()
        await fakeMemeto.update(CodeWhispererConstants.autoTriggerEnabledKey, true)

        let res = get(CodeWhispererConstants.autoTriggerEnabledKey, fakeMemeto)
        assert.strictEqual(res, true)

        await fakeMemeto.update(CodeWhispererConstants.autoTriggerEnabledKey, undefined)
        res = get(CodeWhispererConstants.autoTriggerEnabledKey, fakeMemeto)
        assert.strictEqual(res, undefined)

        await fakeMemeto.update(CodeWhispererConstants.autoTriggerEnabledKey, false)
        res = get(CodeWhispererConstants.autoTriggerEnabledKey, fakeMemeto)
        assert.strictEqual(res, false)
    })

    it('test set()', async function () {
        const fakeMemeto = new FakeMemento()
        await set(CodeWhispererConstants.autoTriggerEnabledKey, true, fakeMemeto)
        assert.strictEqual(fakeMemeto.get(CodeWhispererConstants.autoTriggerEnabledKey), true)

        await set(CodeWhispererConstants.autoTriggerEnabledKey, false, fakeMemeto)
        assert.strictEqual(fakeMemeto.get(CodeWhispererConstants.autoTriggerEnabledKey), false)
    })

    describe('toggleCodeSuggestion', function () {
        class TestCodeSuggestionsState extends CodeSuggestionsState {
            public constructor(initialState?: boolean) {
                super(new FakeMemento(), initialState)
            }
        }

        let codeSuggestionsState: CodeSuggestionsState

        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
            codeSuggestionsState = new TestCodeSuggestionsState()
        })

        it('has suggestions disabled by default', async function () {
            targetCommand = testCommand(toggleCodeSuggestions, codeSuggestionsState)
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), false)
        })

        it('toggles states as expected', async function () {
            targetCommand = testCommand(toggleCodeSuggestions, codeSuggestionsState)
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), false)
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), true)
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), false)
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), true)
        })

        it('setSuggestionsEnabled() works as expected', async function () {
            // initially false
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), false)

            await codeSuggestionsState.setSuggestionsEnabled(true)
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), true)

            // set new state to current state
            await codeSuggestionsState.setSuggestionsEnabled(true)
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), true)

            // set to opposite state
            await codeSuggestionsState.setSuggestionsEnabled(false)
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), false)
        })

        it('triggers event listener when toggled', async function () {
            const eventListener = sinon.stub()
            codeSuggestionsState.onDidChangeState(() => {
                eventListener()
            })
            assert.strictEqual(eventListener.callCount, 0)

            targetCommand = testCommand(toggleCodeSuggestions, codeSuggestionsState)
            await targetCommand.execute(placeholder, cwQuickPickSource)

            await waitUntil(async () => eventListener.callCount === 1, { timeout: 1000, interval: 1 })
            assert.strictEqual(eventListener.callCount, 1)
        })

        it('emits aws_modifySetting event on user toggling autoSuggestion - deactivate', async function () {
            codeSuggestionsState = new TestCodeSuggestionsState(true)
            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), true)

            targetCommand = testCommand(toggleCodeSuggestions, codeSuggestionsState)
            await targetCommand.execute(placeholder, cwQuickPickSource)

            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), false)
            assertTelemetryCurried('aws_modifySetting')({
                settingId: CodeWhispererConstants.autoSuggestionConfig.settingId,
                settingState: CodeWhispererConstants.autoSuggestionConfig.deactivated,
            })
        })

        it('emits aws_modifySetting event on user toggling autoSuggestion -- activate', async function () {
            targetCommand = testCommand(toggleCodeSuggestions, codeSuggestionsState)
            await targetCommand.execute(placeholder, cwQuickPickSource)

            assert.strictEqual(codeSuggestionsState.isSuggestionsEnabled(), true)
            assertTelemetryCurried('aws_modifySetting')({
                settingId: CodeWhispererConstants.autoSuggestionConfig.settingId,
                settingState: CodeWhispererConstants.autoSuggestionConfig.activated,
            })
        })

        it('includes the "source" in the command execution metric', async function () {
            targetCommand = testCommand(toggleCodeSuggestions, codeSuggestionsState)
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assertTelemetry('vscode_executeCommand', { source: cwQuickPickSource, command: targetCommand.id })
        })
    })

    describe('showSecurityScan', function () {
        let mockExtensionContext: vscode.ExtensionContext
        let mockSecurityPanelViewProvider: SecurityPanelViewProvider
        let mockClient: DefaultCodeWhispererClient
        let mockExtContext: ExtContext

        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
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

            await targetCommand.execute(placeholder, cwQuickPickSource)
            assert.ok(spy.called)
        })

        it('shows information message if there is no active text editor', async function () {
            targetCommand = testCommand(showSecurityScan, mockExtContext, mockSecurityPanelViewProvider, mockClient)

            sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)

            assert.ok(!vscode.window.activeTextEditor || !isTextEditor(vscode.window.activeTextEditor))
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assert.strictEqual(getTestWindow().shownMessages[0].message, 'Open a valid file to scan.')
        })

        it('includes the "source" in the command execution metric', async function () {
            targetCommand = testCommand(showSecurityScan, mockExtContext, mockSecurityPanelViewProvider, mockClient)
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assertTelemetry('vscode_executeCommand', { source: cwQuickPickSource, command: targetCommand.id })
        })
    })

    describe('showReferenceLog', function () {
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            targetCommand?.dispose()
            sinon.restore()
        })

        it('includes the "source" in the command execution metric', async function () {
            targetCommand = testCommand(showReferenceLog)
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assertTelemetry('vscode_executeCommand', { source: cwQuickPickSource, command: targetCommand.id })
        })
    })

    describe('selectCustomizationPrompt', function () {
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            targetCommand?.dispose()
            sinon.restore()
        })

        it('includes the "source" in the command execution metric', async function () {
            targetCommand = testCommand(selectCustomizationPrompt)
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assertTelemetry('vscode_executeCommand', { source: cwQuickPickSource, command: targetCommand.id })
        })
    })

    describe('reconnect', function () {
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            targetCommand?.dispose()
            sinon.restore()
        })

        it('includes the "source" in the command execution metric', async function () {
            sinon.stub(AuthUtil.instance, 'reauthenticate')
            targetCommand = testCommand(reconnect)
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assertTelemetry('vscode_executeCommand', { source: cwQuickPickSource, command: targetCommand.id })
        })
    })

    describe('signoutCodeWhisperer', function () {
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            targetCommand?.dispose()
            sinon.restore()
        })

        it('includes the "source" in the command execution metric', async function () {
            sinon.stub(AuthUtil.instance.secondaryAuth, 'deleteConnection')
            targetCommand = testCommand(signoutCodeWhisperer, AuthUtil.instance)
            await targetCommand.execute(placeholder, cwQuickPickSource)
            assertTelemetry('vscode_executeCommand', { source: cwQuickPickSource, command: targetCommand.id })
        })
    })

    describe('listCodeWhispererCommands()', function () {
        function genericItems() {
            return [createFeedbackNode(), createGitHubNode(), createDocumentationNode()]
        }

        before(async function () {
            tryRegister(listCodeWhispererCommands)
        })

        it('shows expected items when not connected', async function () {
            sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(false)

            getTestWindow().onDidShowQuickPick(e => {
                e.assertContainsItems(createSignIn(), createLearnMore(), ...genericItems())
                e.dispose() // skip needing to select an item to continue
            })

            await listCodeWhispererCommands.execute()
        })

        it('shows expected items when connection is expired', async function () {
            sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(true)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(true)

            getTestWindow().onDidShowQuickPick(e => {
                e.assertContainsItems(createReconnect(), createLearnMore(), ...genericItems(), createSignout())
                e.dispose() // skip needing to select an item to continue
            })

            await listCodeWhispererCommands.execute()
        })

        it('shows expected quick pick items when connected', async function () {
            sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(true)
            sinon.stub(CodeScansState.instance, 'isScansEnabled').returns(false)
            getTestWindow().onDidShowQuickPick(e => {
                e.assertContainsItems(
                    createAutoSuggestions(false),
                    createOpenReferenceLog(),
                    createGettingStarted(),
                    createAutoScans(false),
                    createSecurityScan(),
                    switchToAmazonQNode(),
                    ...genericItems(),
                    createSettingsNode(),
                    createSignout()
                )
                e.dispose() // skip needing to select an item to continue
            })
            await listCodeWhispererCommands.execute()
        })

        it('also shows customizations when connected to valid sso', async function () {
            sinon.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)
            sinon.stub(AuthUtil.instance, 'isConnected').returns(true)
            sinon.stub(AuthUtil.instance, 'isValidEnterpriseSsoInUse').returns(true)
            sinon.stub(AuthUtil.instance, 'isCustomizationFeatureEnabled').value(true)
            sinon.stub(CodeScansState.instance, 'isScansEnabled').returns(false)

            getTestWindow().onDidShowQuickPick(async e => {
                e.assertContainsItems(
                    createAutoSuggestions(false),
                    createSelectCustomization(),
                    createOpenReferenceLog(),
                    createGettingStarted(),
                    createAutoScans(false),
                    createSecurityScan(),
                    switchToAmazonQNode(),
                    ...genericItems(),
                    createSettingsNode(),
                    createSignout()
                )
                e.dispose() // skip needing to select an item to continue
            })

            await listCodeWhispererCommands.execute()
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
