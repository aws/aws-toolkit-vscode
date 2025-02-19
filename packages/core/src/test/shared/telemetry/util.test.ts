/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Memento, ConfigurationTarget } from 'vscode'
import { Settings } from '../../../shared/settings'
import {
    convertLegacy,
    getClientId,
    getUserAgent,
    hadClientIdOnStartup,
    platformPair,
    SessionId,
    telemetryClientIdEnvKey,
    TelemetryConfig,
} from '../../../shared/telemetry/util'
import { extensionVersion } from '../../../shared/vscode/env'
import { FakeMemento } from '../../fakeExtensionContext'
import { GlobalState } from '../../../shared/globalState'
import { randomUUID } from 'crypto'
import { isUuid } from '../../../shared/crypto'

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
        for (const scenario of scenarios) {
            it(scenario.desc, async () => {
                await settings.update(settingKey, scenario.initialSettingValue)

                assert.strictEqual(sut.isEnabled(), scenario.expectedIsEnabledValue)
            })
        }
    })

    describe('sanitizeTelemetrySetting', function () {
        for (const scenario of scenarios) {
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
        }
    })
})

describe('getSessionId', function () {
    it('returns a stable UUID', function () {
        const result = SessionId.getSessionId()

        assert.deepStrictEqual(isUuid(result), true)
        assert.deepStrictEqual(SessionId.getSessionId(), result, 'Subsequent call did not return the same UUID')
    })

    it('overwrites something that does not look like a UUID', function () {
        ;(globalThis as any).amzn_sessionId = 'notAUUID'
        const result = SessionId.getSessionId()

        assert.deepStrictEqual(isUuid(result), true)
        assert.deepStrictEqual(SessionId.getSessionId(), result, 'Subsequent call did not return the same UUID')
    })
})

describe('getClientId', function () {
    before(function () {
        setClientIdEnvVar(undefined)
    })

    afterEach(function () {
        setClientIdEnvVar(undefined)
    })

    function testGetClientId(globalState: GlobalState) {
        return getClientId(globalState, true, false, randomUUID())
    }

    function setClientIdEnvVar(val: string | undefined) {
        if (val === undefined) {
            delete process.env[telemetryClientIdEnvKey]
            return
        }

        process.env[telemetryClientIdEnvKey] = val
    }

    it('generates a unique id if no other id is available', function () {
        const c1 = testGetClientId(new GlobalState(new FakeMemento()))
        setClientIdEnvVar(undefined)
        const c2 = testGetClientId(new GlobalState(new FakeMemento()))
        assert.notStrictEqual(c1, c2)
    })

    it('uses id stored in global state if an id is not found in process.env', async function () {
        const expectedClientId = 'myId'

        const memento = new GlobalState(new FakeMemento())
        await memento.update('telemetryClientId', expectedClientId)

        assert.strictEqual(testGetClientId(memento), expectedClientId)
    })

    it('uses the id stored in process.env if available', async function () {
        const expectedClientId = 'myId'

        const e = new GlobalState(new FakeMemento())
        await e.update('telemetryClientId', randomUUID())
        setClientIdEnvVar(expectedClientId)

        assert.strictEqual(testGetClientId(new GlobalState(new FakeMemento())), expectedClientId)
    })

    it('returns the same value across the calls sequentially', async function () {
        const memento = new GlobalState(new FakeMemento())
        const c1 = testGetClientId(memento)
        const c2 = testGetClientId(memento)
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
        const clientId = testGetClientId(new GlobalState(memento))
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
        const clientId = testGetClientId(new FakeGlobalState(memento))
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

    describe('hadClientIdOnStartup', async function () {
        it('returns false when no existing clientId', async function () {
            const globalState = new GlobalState(new FakeMemento())
            assert.strictEqual(hadClientIdOnStartup(globalState, testGetClientId), false)
        })

        it('returns true when existing env var clientId', async function () {
            const globalState = new GlobalState(new FakeMemento())
            setClientIdEnvVar('aaa-111')
            assert.strictEqual(hadClientIdOnStartup(globalState, testGetClientId), true)
        })

        it('returns true when existing state clientId', async function () {
            const globalState = new GlobalState(new FakeMemento())
            await globalState.update('telemetryClientId', 'bbb-222')
            assert.strictEqual(hadClientIdOnStartup(globalState, testGetClientId), true)
        })
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
