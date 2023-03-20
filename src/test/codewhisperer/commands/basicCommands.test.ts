/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import { assertTelemetryCurried } from '../../testUtil'
import { toggleCodeSuggestions, get, set, showSecurityScan } from '../../../codewhisperer/commands/basicCommands'
import { FakeMemento, FakeExtensionContext } from '../../fakeExtensionContext'
import { testCommand } from '../../shared/vscode/testUtils'
import { Command } from '../../../shared/vscode/commands2'
import { SecurityPanelViewProvider } from '../../../codewhisperer/views/securityPanelViewProvider'
import { DefaultCodeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import { stub } from '../../utilities/stubber'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { getTestWindow } from '../../shared/vscode/window'
import { ExtContext } from '../../../shared/extensions'

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
            assert.strictEqual(getTestWindow().shownMessages[0].message, "Open a valid file to scan.")
        })    
    })
})
