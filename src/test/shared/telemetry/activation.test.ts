/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'

import { FakeExtensionContext } from '../../fakeExtensionContext'
import {
    handleTelemetryNoticeResponse,
    responseDisable,
    responseEnable,
    isTelemetryEnabled,
} from '../../../shared/telemetry/activation'
import { SettingsConfiguration, DefaultSettingsConfiguration } from '../../../shared/settingsConfiguration'
import { TestSettingsConfiguration } from '../../utilities/testSettingsConfiguration'
import { extensionSettingsPrefix } from '../../../shared/constants'

describe('handleTelemetryNoticeResponse', () => {
    let extensionContext: vscode.ExtensionContext
    let toolkitSettings: SettingsConfiguration

    beforeEach(() => {
        extensionContext = new FakeExtensionContext()
        toolkitSettings = new TestSettingsConfiguration()
    })

    it('does nothing when notice is discarded', async () => {
        await handleTelemetryNoticeResponse(undefined, extensionContext, toolkitSettings)

        assert.strictEqual(toolkitSettings.readSetting('telemetry'), undefined, 'Settings should not have been written')
        assert.strictEqual(
            extensionContext.globalState.get('awsTelemetryOptOutShown'),
            undefined,
            'Expected opt out shown state to remain unchanged'
        )
    })

    it('handles Enabled response', async () => {
        await handleTelemetryNoticeResponse(responseEnable, extensionContext, toolkitSettings)

        assert.strictEqual(toolkitSettings.readSetting('telemetry'), true, 'Expected enabled setting')
        assert.strictEqual(
            extensionContext.globalState.get('awsTelemetryOptOutShown'),
            true,
            'Expected opt out shown state to be set'
        )
    })

    it('handles Disabled response', async () => {
        await handleTelemetryNoticeResponse(responseDisable, extensionContext, toolkitSettings)

        assert.strictEqual(toolkitSettings.readSetting('telemetry'), false, 'Expected disabled setting')
        assert.strictEqual(
            extensionContext.globalState.get('awsTelemetryOptOutShown'),
            true,
            'Expected opt out shown state to be set'
        )
    })
})

describe('isTelemetryEnabled', () => {
    let settings: vscode.WorkspaceConfiguration
    const toolkitSettings = new DefaultSettingsConfiguration(extensionSettingsPrefix)

    // These tests operate against the user's configuration.
    // Restore the initial value after testing is complete.
    let originalTelemetryValue: any

    before(async () => {
        settings = vscode.workspace.getConfiguration(extensionSettingsPrefix)
        originalTelemetryValue = settings.get('telemetry')
    })

    after(async () => {
        await settings.update('telemetry', originalTelemetryValue, vscode.ConfigurationTarget.Global)
    })

    const scenarios = [
        { initialSettingValue: 'Enable', expectedIsEnabledValue: true, desc: 'Original opt-in value' },
        { initialSettingValue: 'Disable', expectedIsEnabledValue: false, desc: 'Original opt-out value' },
        { initialSettingValue: 'Use IDE settings', expectedIsEnabledValue: true, desc: 'Original deferral value' },
        { initialSettingValue: true, expectedIsEnabledValue: true, desc: 'Opt in' },
        { initialSettingValue: false, expectedIsEnabledValue: false, desc: 'Opt out' },
        { initialSettingValue: 1234, expectedIsEnabledValue: true, desc: 'Unexpected numbers' },
        { initialSettingValue: { label: 'garbageData' }, expectedIsEnabledValue: true, desc: 'Unexpected object' },
        { initialSettingValue: [{ label: 'garbageDataList' }], expectedIsEnabledValue: true, desc: 'Unexpected array' },
        { initialSettingValue: undefined, expectedIsEnabledValue: true, desc: 'Unset value' },
    ]

    scenarios.forEach(scenario => {
        it(scenario.desc, async () => {
            await settings.update('telemetry', scenario.initialSettingValue, vscode.ConfigurationTarget.Global)

            const isEnabled = isTelemetryEnabled(toolkitSettings)
            assert.strictEqual(isEnabled, scenario.expectedIsEnabledValue)
        })
    })
})
