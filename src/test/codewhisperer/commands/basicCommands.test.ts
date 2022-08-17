/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { resetCodeWhispererGlobalVariables } from '../testUtil'
import { assertTelemetryCurried } from '../../testUtil'
import { CodeWhispererConstants } from '../../../codewhisperer/models/constants'
import { toggleCodeSuggestions, get, set } from '../../../codewhisperer/commands/basicCommands'
import { FakeExtensionContext, FakeMemento } from '../../fakeExtensionContext'
import { ExtContext } from '../../../shared/extensions'
import { AwsContext } from '../../../shared/awsContext'
import { SamCliContext } from '../../../shared/sam/cli/samCliContext'
import { RegionProvider } from '../../../shared/regions/regionProvider'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import { CredentialsStore } from '../../../credentials/credentialsStore'
import { testCommand } from '../../shared/vscode/testUtils'
import { Command } from '../../../shared/vscode/commands2'

describe('CodeWhisperer-basicCommands', function () {
    describe('CodeWhisperer-basicCommands', function () {
        let targetCommand: Command<any> & vscode.Disposable

        beforeEach(function () {
            resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            if (targetCommand) {
                targetCommand.dispose()
            }
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

        it('test toggleCodeSuggestions: should emit aws_modifySetting event on user toggling autoSuggestion -- activate', async function () {
            const fakeExtContext: ExtContext = {
                extensionContext: await FakeExtensionContext.create(),
                awsContext: {} as AwsContext,
                samCliContext: () => {
                    return {} as SamCliContext
                },
                regionProvider: {} as RegionProvider,
                outputChannel: {} as vscode.OutputChannel,
                telemetryService: {} as TelemetryService,
                credentialsStore: {} as CredentialsStore,
                invokeOutputChannel: {} as vscode.OutputChannel,
            }
            targetCommand = testCommand(toggleCodeSuggestions, fakeExtContext)

            assert.strictEqual(
                fakeExtContext.extensionContext.globalState.get(CodeWhispererConstants.autoTriggerEnabledKey),
                undefined
            )
            await targetCommand.execute()
            const res = fakeExtContext.extensionContext.globalState.get(CodeWhispererConstants.autoTriggerEnabledKey)
            assert.strictEqual(res, true)
            assertTelemetryCurried('aws_modifySetting')({
                settingId: CodeWhispererConstants.AutoSuggestion.settingId,
                settingState: CodeWhispererConstants.AutoSuggestion.activated,
            })
        })

        it('test toggleCodeSuggestions: should emit aws_modifySetting event on user toggling autoSuggestion - deactivate', async function () {
            const fakeExtContext: ExtContext = {
                extensionContext: await FakeExtensionContext.create(),
                awsContext: {} as AwsContext,
                samCliContext: () => {
                    return {} as SamCliContext
                },
                regionProvider: {} as RegionProvider,
                outputChannel: {} as vscode.OutputChannel,
                telemetryService: {} as TelemetryService,
                credentialsStore: {} as CredentialsStore,
                invokeOutputChannel: {} as vscode.OutputChannel,
            }
            targetCommand = testCommand(toggleCodeSuggestions, fakeExtContext)
            fakeExtContext.extensionContext.globalState.update(CodeWhispererConstants.autoTriggerEnabledKey, true)
            assert.strictEqual(
                fakeExtContext.extensionContext.globalState.get(CodeWhispererConstants.autoTriggerEnabledKey),
                true
            )

            await targetCommand.execute()
            const res = fakeExtContext.extensionContext.globalState.get(CodeWhispererConstants.autoTriggerEnabledKey)
            assert.strictEqual(res, false)
            assertTelemetryCurried('aws_modifySetting')({
                settingId: CodeWhispererConstants.AutoSuggestion.settingId,
                settingState: CodeWhispererConstants.AutoSuggestion.deactivated,
            })
        })
    })
})
