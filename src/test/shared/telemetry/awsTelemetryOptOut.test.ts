/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AwsTelemetryOptOut, TelemetryOptOutOptions } from '../../../shared/telemetry/awsTelemetryOptOut'
import { TelemetryEvent } from '../../../shared/telemetry/telemetryEvent'
import { TelemetryFeedback } from '../../../shared/telemetry/telemetryFeedback'
import { TelemetryService } from '../../../shared/telemetry/telemetryService'
import { TestSettingsConfiguration } from '../../../test/utilities/testSettingsConfiguration'

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

    it('updateTelemetryConfiguration saves settings', async () => {
        await telemetryOptOut.updateTelemetryConfiguration(TelemetryOptOutOptions.Enable)
        assert.strictEqual(mockSettings.readSetting<boolean>('telemetry'), true)
        await telemetryOptOut.updateTelemetryConfiguration(TelemetryOptOutOptions.Disable)
        assert.strictEqual(mockSettings.readSetting<boolean>('telemetry'), false)
        await telemetryOptOut.updateTelemetryConfiguration(TelemetryOptOutOptions.SameAsVsCode)
        assert.strictEqual(mockSettings.readSetting<boolean>('telemetry'), undefined)
    })

    it('updateTelemetryConfiguration(TelemetryOptOutOptions.Enable) enables telemetry', async () => {
        await telemetryOptOut.updateTelemetryConfiguration(TelemetryOptOutOptions.Enable)
        assert.strictEqual(mockService.telemetryEnabled, true)
    })

    it('updateTelemetryConfiguration(TelemetryOptOutOptions.Disable) disables telemetry', async () => {
        await telemetryOptOut.updateTelemetryConfiguration(TelemetryOptOutOptions.Disable)
        assert.strictEqual(mockService.telemetryEnabled, false)
    })

    // VS Code tests use the same preferences as the host editor
    it('updateTelemetryConfiguration(TelemetryOptOutOptions.SameAsVsCode) matches user setting', async () => {
        const telemetryOptOutVsCodeOptionAlwaysTrue = new AwsTelemetryOptOut(mockService, mockSettings, () => true)
        await telemetryOptOutVsCodeOptionAlwaysTrue.updateTelemetryConfiguration(TelemetryOptOutOptions.SameAsVsCode)
        assert.strictEqual(mockService.telemetryEnabled, true)

        const telemetryOptOutVsCodeOptionAlwaysFalse = new AwsTelemetryOptOut(mockService, mockSettings, () => false)
        await telemetryOptOutVsCodeOptionAlwaysFalse.updateTelemetryConfiguration(TelemetryOptOutOptions.SameAsVsCode)
        assert.strictEqual(mockService.telemetryEnabled, false)
    })
})
