/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'

import { FakeExtensionContext } from '../../fakeExtensionContext'
import { handleTelemetryNoticeResponse, responseDisable, responseEnable } from '../../../shared/telemetry/activation'
import { SettingsConfiguration } from '../../../shared/settingsConfiguration'
import { TestSettingsConfiguration } from '../../utilities/testSettingsConfiguration'

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

        assert.strictEqual(toolkitSettings.readSetting('telemetry'), 'Enable', 'Expected enabled setting')
        assert.strictEqual(
            extensionContext.globalState.get('awsTelemetryOptOutShown'),
            true,
            'Expected opt out shown state to be set'
        )
    })

    it('handles Disabled response', async () => {
        await handleTelemetryNoticeResponse(responseDisable, extensionContext, toolkitSettings)

        assert.strictEqual(toolkitSettings.readSetting('telemetry'), 'Disable', 'Expected disabled setting')
        assert.strictEqual(
            extensionContext.globalState.get('awsTelemetryOptOutShown'),
            true,
            'Expected opt out shown state to be set'
        )
    })
})
