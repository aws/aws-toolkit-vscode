/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Memento, ConfigurationTarget } from 'vscode'
import { Settings } from '../../../shared/settings'
import { convertLegacy, getClientId, getUserAgent, platformPair, TelemetryConfig } from '../../../shared/telemetry/util'
import { extensionVersion } from '../../../shared/vscode/env'
import { FakeMemento } from '../../fakeExtensionContext'
import { GlobalState } from '../../../shared/globalState'

describe('TelemetryConfig', function () {
    const settingKey = 'aws.telemetry'
    const settings = new Settings(ConfigurationTarget.Workspace)

    let sut: TelemetryConfig

    beforeEach(function () {
        sut = new TelemetryConfig(settings)
    })

    afterEach(async function () {
        await sut.toolkitConfig.reset()
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
        scenarios.forEach((scenario) => {
            it(scenario.desc, async () => {
                await settings.update(settingKey, scenario.initialSettingValue)

                assert.strictEqual(sut.isEnabled(), scenario.expectedIsEnabledValue)
            })
        })
    })

    describe('sanitizeTelemetrySetting', function () {
        scenarios.forEach((scenario) => {
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
        const c1 = getClientId(new GlobalState(new FakeMemento()), true, false, 'x1')
        const c2 = getClientId(new GlobalState(new FakeMemento()), true, false, 'x2')
        assert.notStrictEqual(c1, c2)
    })

    it('returns the same value across the calls sequentially', async function () {
        const memento = new GlobalState(new FakeMemento())
        const c1 = getClientId(memento, true, false, 'y1')
        const c2 = getClientId(memento, true, false, 'y2')
        assert.strictEqual(c1, c2)
    })

    it('returns nil UUID if it fails to save generated UUID', async function () {
        const memento: Memento = {
            keys: () => [],
            get(key) {
                return undefined
            },
            update(key, value) {
                throw new Error()
            },
        }
        const clientId = getClientId(new GlobalState(memento), true, false, 'x3')
        // XXX: `notStrictEqual` since getClientId() is now synchronous. Because memento.update() is async.
        assert.notStrictEqual(clientId, '00000000-0000-0000-0000-000000000000')
    })

    it('returns the nil UUID if it fails to get the saved UUID', async function () {
        const memento: Memento = {
            keys: () => [],
            get(key) {
                throw new Error()
            },
            async update(key, value) {},
        }
        class FakeGlobalState extends GlobalState {
            override tryGet<T>(key: any, defaultVal?: T): T | undefined {
                return this.memento.get(key)
            }
        }
        const clientId = getClientId(new FakeGlobalState(memento), true, false, 'x4')
        assert.strictEqual(clientId, '00000000-0000-0000-0000-000000000000')
    })

    it('should be ffffffff-ffff-ffff-ffff-ffffffffffff if in test enviroment', async function () {
        const clientId = getClientId(new GlobalState(new FakeMemento()), true)
        assert.strictEqual(clientId, 'ffffffff-ffff-ffff-ffff-ffffffffffff')
    })

    it('should be ffffffff-ffff-ffff-ffff-ffffffffffff if telemetry is not enabled in test enviroment', async function () {
        const clientId = getClientId(new GlobalState(new FakeMemento()), false)
        assert.strictEqual(clientId, 'ffffffff-ffff-ffff-ffff-ffffffffffff')
    })

    it('should be 11111111-1111-1111-1111-111111111111 if telemetry is not enabled', async function () {
        const clientId = getClientId(new GlobalState(new FakeMemento()), false, false)
        assert.strictEqual(clientId, '11111111-1111-1111-1111-111111111111')
    })
})

describe('getUserAgent', function () {
    it('includes product name and version', async function () {
        const userAgent = getUserAgent()
        const lastPair = userAgent.split(' ')[0]
        assert.ok(lastPair?.startsWith(`AWS-Toolkit-For-VSCode/${extensionVersion}`))
    })

    it('includes only one pair by default', async function () {
        const userAgent = getUserAgent()
        const pairs = userAgent.split(' ')
        assert.strictEqual(pairs.length, 1)
    })

    it('omits `ClientId` by default', async function () {
        const userAgent = getUserAgent()
        assert.ok(!userAgent.includes('ClientId'))
    })

    it('includes `ClientId` at the end if opted in', async function () {
        const userAgent = getUserAgent({ includeClientId: true })
        const lastPair = userAgent.split(' ').pop()
        assert.ok(lastPair?.startsWith('ClientId/'))
    })

    it('includes the platform before `ClientId` if opted in', async function () {
        const userAgent = getUserAgent({ includePlatform: true, includeClientId: true })
        const pairs = userAgent.split(' ')
        const clientPairIndex = pairs.findIndex((pair) => pair.startsWith('ClientId/'))
        const beforeClient = pairs[clientPairIndex - 1]
        assert.strictEqual(beforeClient, platformPair())
    })
})
