/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { AwsTelemetryOptOut } from '../../../shared/telemetry/awsTelemetryOptOut'
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
}

describe('AwsTelemetryOptOut', () => {
    const mockService = new MockTelemetryService()
    const mockSettings = new TestSettingsConfiguration()
    const telemetryOptOut = new AwsTelemetryOptOut(mockService, mockSettings)

    it('updateTelemetryConfiguration saves settings', async () => {
        await telemetryOptOut.updateTelemetryConfiguration('Yes')
        assert.strictEqual(mockSettings.readSetting<boolean>('telemetry'), true)
        await telemetryOptOut.updateTelemetryConfiguration('No')
        assert.strictEqual(mockSettings.readSetting<boolean>('telemetry'), false)
        await telemetryOptOut.updateTelemetryConfiguration(undefined)
        assert.strictEqual(mockSettings.readSetting<boolean>('telemetry'), undefined)
    })

    it('updateTelemetryConfiguration("Yes") enables telemetry', async () => {
        await telemetryOptOut.updateTelemetryConfiguration('Yes')
        assert.strictEqual(mockService.telemetryEnabled, true)
    })

    it('updateTelemetryConfiguration("No") disables telemetry', async () => {
        await telemetryOptOut.updateTelemetryConfiguration('No')
        assert.strictEqual(mockService.telemetryEnabled, false)
    })

    it('updateTelemetryConfiguration(undefined) enables telemetry', async () => {
        await telemetryOptOut.updateTelemetryConfiguration(undefined)
        assert.strictEqual(mockService.telemetryEnabled, true)
    })
})
