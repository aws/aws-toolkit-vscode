/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    AwsTelemetryOptOut,
    SETTINGS_TELEMETRY_VALUE_ENABLE,
    SETTINGS_TELEMETRY_VALUE_DISABLE,
    SETTINGS_TELEMETRY_VALUE_USEIDE,
} from '../../../shared/telemetry/awsTelemetryOptOut'
import { TelemetryEvent } from '../../../shared/telemetry/telemetryEvent'
import { TelemetryFeedback } from '../../../shared/telemetry/telemetryFeedback'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import { TestSettingsConfiguration } from '../../../test/utilities/testSettingsConfiguration'
import { DefaultSettingsConfiguration } from '../../../shared/settingsConfiguration'
import { extensionSettingsPrefix } from '../../../shared/constants'

class MockTelemetryService implements TelemetryService {
    public persistFilePath: string = ''
    private _telemetryEnabled: boolean = false

    public get telemetryEnabled(): boolean {
        return this._telemetryEnabled
    }
    public set telemetryEnabled(value: boolean) {
        this._telemetryEnabled = value
    }

    public async start(): Promise<void> {
        return
    }
    public async shutdown(): Promise<void> {
        return
    }
    public async postFeedback(feedback: TelemetryFeedback): Promise<void> {
        return
    }
    public record(_event: TelemetryEvent): void {
        return
    }
    public clearRecords(): void {}
    public notifyOptOutOptionMade(): void {}
}

describe('AwsTelemetryOptOut', () => {
    const mockService = new MockTelemetryService()
    const mockSettings = new TestSettingsConfiguration()
    const telemetryOptOut = new AwsTelemetryOptOut(mockService, mockSettings)

    it('updateTelemetryConfiguration(Enable) enables telemetry', async () => {
        await telemetryOptOut.updateTelemetryConfiguration(SETTINGS_TELEMETRY_VALUE_ENABLE)
        assert.strictEqual(mockService.telemetryEnabled, true)
    })

    it('updateTelemetryConfiguration(Disable) disables telemetry', async () => {
        await telemetryOptOut.updateTelemetryConfiguration(SETTINGS_TELEMETRY_VALUE_DISABLE)
        assert.strictEqual(mockService.telemetryEnabled, false)
    })

    // VS Code tests use the same preferences as the host editor
    it('updateTelemetryConfiguration(UseIde) matches user setting', async () => {
        const telemetryOptOutVsCodeOptionAlwaysTrue = new AwsTelemetryOptOut(mockService, mockSettings, () => true)
        await telemetryOptOutVsCodeOptionAlwaysTrue.updateTelemetryConfiguration(SETTINGS_TELEMETRY_VALUE_USEIDE)
        assert.strictEqual(mockService.telemetryEnabled, true)

        const telemetryOptOutVsCodeOptionAlwaysFalse = new AwsTelemetryOptOut(mockService, mockSettings, () => false)
        await telemetryOptOutVsCodeOptionAlwaysFalse.updateTelemetryConfiguration(SETTINGS_TELEMETRY_VALUE_USEIDE)
        assert.strictEqual(mockService.telemetryEnabled, false)
    })
})

// TODO : separate out concerns in AwsTelemetryOptOut so we can test smaller portions of AwsTelemetryOptOut
describe('AwsTelemetryOptOut VSCode configuration', () => {
    const mockService = new MockTelemetryService()
    // Must use the real settings because VS Code has explicit handling around enum values
    const settings = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    const telemetryOptOut = new AwsTelemetryOptOut(mockService, settings, () => false)

    const scenarios = [
        {
            optOutOption: SETTINGS_TELEMETRY_VALUE_ENABLE,
            expectedSetting: SETTINGS_TELEMETRY_VALUE_ENABLE,
        },
        {
            optOutOption: SETTINGS_TELEMETRY_VALUE_DISABLE,
            expectedSetting: SETTINGS_TELEMETRY_VALUE_DISABLE,
        },
        {
            optOutOption: SETTINGS_TELEMETRY_VALUE_USEIDE,
            expectedSetting: SETTINGS_TELEMETRY_VALUE_USEIDE,
        },
        {
            optOutOption: 'garbage',
            expectedSetting: SETTINGS_TELEMETRY_VALUE_USEIDE,
        },
    ]

    scenarios.forEach(scenario => {
        it(`handles ${scenario.optOutOption}`, async () => {
            await telemetryOptOut.updateTelemetryConfiguration(scenario.optOutOption)
            assert.strictEqual(settings.readSetting<boolean>('telemetry'), scenario.expectedSetting)
        })
    })
})
