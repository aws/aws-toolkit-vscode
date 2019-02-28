/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { AwsTelemetryOptOut, TelemetryOptOutOptions } from '../../../shared/telemetry/awsTelemetryOptOut'
import { TelemetryEvent } from '../../../shared/telemetry/telemetryEvent'
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

    public async start(): Promise<void> { return }
    public async shutdown(): Promise<void> { return }
    public record(_event: TelemetryEvent ): void { return }
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

    // VS Code has opt-in telemetry by default so this test exists to tell us if Microsoft changes that behavior
    it('updateTelemetryConfiguration(TelemetryOptOutOptions.SameAsVsCode) enables telemetry', async () => {
        await telemetryOptOut.updateTelemetryConfiguration(TelemetryOptOutOptions.SameAsVsCode)
        assert.strictEqual(mockService.telemetryEnabled, true)
    })
})
