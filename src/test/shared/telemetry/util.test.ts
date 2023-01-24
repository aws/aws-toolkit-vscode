/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Memento, ConfigurationTarget } from 'vscode'
import { Settings } from '../../../shared/settings'
import { convertLegacy, getClientId, TelemetryConfig } from '../../../shared/telemetry/util'
import { FakeMemento } from '../../fakeExtensionContext'

describe('TelemetryConfig', function () {
    const settingKey = 'aws.telemetry'
    const settings = new Settings(ConfigurationTarget.Workspace)

    let sut: TelemetryConfig

    beforeEach(function () {
        sut = new TelemetryConfig(settings)
    })

    afterEach(async function () {
        await sut.reset()
    })

    const scenarios = [
        {
            initialSettingValue: 'Enable',
            expectedIsEnabledValue: true,
            desc: 'Original opt-in value',
            expectedSanitizedValue: true,
        },
        {
            initialSettingValue: 'Disable',
            expectedIsEnabledValue: false,
            desc: 'Original opt-out value',
            expectedSanitizedValue: false,
        },
        {
            initialSettingValue: 'Use IDE settings',
            expectedIsEnabledValue: true,
            desc: 'Original deferral value',
            expectedSanitizedValue: 'Use IDE settings',
        },
        { initialSettingValue: true, expectedIsEnabledValue: true, desc: 'Opt in', expectedSanitizedValue: true },
        { initialSettingValue: false, expectedIsEnabledValue: false, desc: 'Opt out', expectedSanitizedValue: false },
        {
            initialSettingValue: 1234,
            expectedIsEnabledValue: true,
            desc: 'Unexpected numbers',
            expectedSanitizedValue: 1234,
        },
        {
            initialSettingValue: { label: 'garbageData' },
            expectedIsEnabledValue: true,
            desc: 'Unexpected object',
            expectedSanitizedValue: { label: 'garbageData' },
        },
        {
            initialSettingValue: [{ label: 'garbageDataList' }],
            expectedIsEnabledValue: true,
            desc: 'Unexpected array',
            expectedSanitizedValue: [{ label: 'garbageDataList' }],
        },
        {
            initialSettingValue: undefined,
            expectedIsEnabledValue: true,
            desc: 'Unset value',
            expectedSanitizedValue: undefined,
        },
    ]

    describe('isTelemetryEnabled', function () {
        scenarios.forEach(scenario => {
            it(scenario.desc, async () => {
                await settings.update(settingKey, scenario.initialSettingValue)

                assert.strictEqual(sut.isEnabled(), scenario.expectedIsEnabledValue)
            })
        })
    })

    describe('sanitizeTelemetrySetting', function () {
        scenarios.forEach(scenario => {
            it(scenario.desc, () => {
                const tryConvert = () => {
                    try {
                        return convertLegacy(scenario.initialSettingValue)
                    } catch {
                        return scenario.initialSettingValue
                    }
                }

                assert.deepStrictEqual(tryConvert(), scenario.expectedSanitizedValue)
            })
        })
    })
})

describe('getClientId', function () {
    it('should generate a unique id', async function () {
        const c1 = await getClientId(new FakeMemento(), true, false)
        const c2 = await getClientId(new FakeMemento(), true, false)
        assert.notStrictEqual(c1, c2)
    })

    it('returns the same value across the calls', async function () {
        const memento = new FakeMemento()
        const c1 = getClientId(memento, true, false)
        const c2 = getClientId(memento, true, false)
        assert.strictEqual(await c1, await c2, 'Expected client ids to be same')
    })

    it('returns the same value across the calls sequentially', async function () {
        const memento = new FakeMemento()
        const c1 = await getClientId(memento, true, false)
        const c2 = await getClientId(memento, true, false)
        assert.strictEqual(c1, c2)
    })

    it('returns the nil UUID if it fails to save generated UUID', async function () {
        const mememto: Memento = {
            get(key) {
                return undefined
            },
            update(key, value) {
                throw new Error()
            },
        }
        const clientId = await getClientId(mememto, true, false)
        assert.strictEqual(clientId, '00000000-0000-0000-0000-000000000000')
    })

    it('returns the nil UUID if fails to retrive a saved UUID.', async function () {
        const mememto: Memento = {
            get(key) {
                throw new Error()
            },
            async update(key, value) {},
        }
        const clientId = await getClientId(mememto, true, false)
        assert.strictEqual(clientId, '00000000-0000-0000-0000-000000000000')
    })

    it('should be ffffffff-ffff-ffff-ffff-ffffffffffff if in test enviroment', async function () {
        const clientId = await getClientId(new FakeMemento(), true)
        assert.strictEqual(clientId, 'ffffffff-ffff-ffff-ffff-ffffffffffff')
    })

    it('should be ffffffff-ffff-ffff-ffff-ffffffffffff if telemetry is not enabled in test enviroment', async function () {
        const clientId = await getClientId(new FakeMemento(), false)
        assert.strictEqual(clientId, 'ffffffff-ffff-ffff-ffff-ffffffffffff')
    })

    it('should be 11111111-1111-1111-1111-111111111111 if telemetry is not enabled', async function () {
        const clientId = await getClientId(new FakeMemento(), false, false)
        assert.strictEqual(clientId, '11111111-1111-1111-1111-111111111111')
    })
})
