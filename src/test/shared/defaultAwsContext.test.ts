/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ConfigurationTarget } from 'vscode'
import { profileSettingKey, regionSettingKey } from '../../shared/constants'
import { DefaultAwsContext } from '../../shared/defaultAwsContext'
import { SettingsConfiguration } from '../../shared/settingsConfiguration'
import { FakeExtensionContext, FakeMementoStorage } from '../fakeExtensionContext'

describe('DefaultAwsContext', () => {

    const testRegion1Value: string = 're-gion-1'
    const testRegion2Value: string = 're-gion-2'
    const testProfileValue: string = 'profile1'

    class ContextTestsSettingsConfigurationBase implements SettingsConfiguration {
        public readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
            return undefined
        }

        public async writeSetting<T>(
            settingKey: string, value: T | undefined,
            target: ConfigurationTarget
        ): Promise<void> {
        }
    }

    it('reads profile from config on startup', () => {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            public readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
                if (settingKey === profileSettingKey) {
                    return testProfileValue as any as T
                }

                return super.readSetting(settingKey, defaultValue)
            }

        }

        const testContext = new DefaultAwsContext(new TestConfiguration(), new FakeExtensionContext())
        assert.strictEqual(testContext.getCredentialProfileName(), testProfileValue)
    })

    it('gets single region from config on startup', async () => {

        const fakeMementoStorage: FakeMementoStorage = {}
        fakeMementoStorage[regionSettingKey] = [testRegion1Value]

        const fakeExtensionContext = new FakeExtensionContext({
            globalState: fakeMementoStorage
        })

        const testContext = new DefaultAwsContext(new ContextTestsSettingsConfigurationBase(), fakeExtensionContext)
        const regions = await testContext.getExplorerRegions()
        assert.strictEqual(regions.length, 1)
        assert.strictEqual(regions[0], testRegion1Value)
    })

    it('gets multiple regions from config on startup', async () => {

        const fakeMementoStorage: FakeMementoStorage = {}
        fakeMementoStorage[regionSettingKey] = [testRegion1Value, testRegion2Value]

        const fakeExtensionContext = new FakeExtensionContext({
            globalState: fakeMementoStorage
        })

        const testContext = new DefaultAwsContext(new ContextTestsSettingsConfigurationBase(), fakeExtensionContext)
        const regions = await testContext.getExplorerRegions()
        assert.strictEqual(regions.length, 2)
        assert.strictEqual(regions[0], testRegion1Value)
        assert.strictEqual(regions[1], testRegion2Value)
    })

    it('updates config on single region change', async () => {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            public async writeSetting<T>(settingKey: string, value: T, target: ConfigurationTarget): Promise<void> {
                const array: string[] = value as any
                assert.strictEqual(settingKey, regionSettingKey)
                assert.strictEqual(array.length, 1)
                assert.strictEqual(array[0], testRegion1Value)
                assert.strictEqual(target, ConfigurationTarget.Global)
            }
        }

        const testContext = new DefaultAwsContext(new TestConfiguration(), new FakeExtensionContext())
        await testContext.addExplorerRegion(testRegion1Value)
    })

    it('updates config on multiple region change', async () => {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            public async writeSetting<T>(settingKey: string, value: T, target: ConfigurationTarget): Promise<void> {
                assert.strictEqual(settingKey, regionSettingKey)
                assert(value instanceof Array)
                const values = value as any as string[]
                assert.strictEqual(values[0], testRegion1Value)
                assert.strictEqual(values[1], testRegion2Value)
                assert.strictEqual(target, ConfigurationTarget.Global)
            }
        }

        const testContext = new DefaultAwsContext(new TestConfiguration(), new FakeExtensionContext())
        await testContext.addExplorerRegion(testRegion1Value, testRegion2Value)
    })

    it('updates on region removal', async () => {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            public readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
                if (settingKey === regionSettingKey) {
                    return [ testRegion1Value, testRegion2Value ] as any as T
                }

                return super.readSetting<T>(settingKey, defaultValue)
            }
            public async writeSetting<T>(settingKey: string, value: T, target: ConfigurationTarget): Promise<void> {
                assert.strictEqual(settingKey, regionSettingKey)
                assert.deepStrictEqual(value, [ testRegion1Value ])
                assert.strictEqual(target, ConfigurationTarget.Global)
            }
        }

        const testContext = new DefaultAwsContext(new TestConfiguration(), new FakeExtensionContext())
        await testContext.removeExplorerRegion(testRegion2Value)
    })

    it('updates config on profile change', async () => {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            public async writeSetting<T>(settingKey: string, value: T, target: ConfigurationTarget): Promise<void> {
                assert.strictEqual(settingKey, profileSettingKey)
                assert.strictEqual(value, testProfileValue)
                assert.strictEqual(target, ConfigurationTarget.Global)
            }
        }

        const testContext = new DefaultAwsContext(new TestConfiguration(), new FakeExtensionContext())
        await testContext.setCredentialProfileName(testProfileValue)
    })

    it('fires event on single region change', async () => {

        const testContext = new DefaultAwsContext(
            new ContextTestsSettingsConfigurationBase(),
            new FakeExtensionContext()
        )

        let invocationCount = 0
        testContext.onDidChangeContext((c) => {
            assert.strictEqual(c.regions.length, 1)
            assert.strictEqual(c.regions[0], testRegion1Value)
            invocationCount++
        })

        await testContext.addExplorerRegion(testRegion1Value)

        assert.strictEqual(invocationCount, 1)
    })

    it('fires event on multi region change', async () => {

        const testContext = new DefaultAwsContext(
            new ContextTestsSettingsConfigurationBase(),
            new FakeExtensionContext()
        )

        let invocationCount = 0
        testContext.onDidChangeContext((c) => {
            assert.strictEqual(c.regions.length, 2)
            assert.strictEqual(c.regions[0], testRegion1Value)
            assert.strictEqual(c.regions[1], testRegion2Value)
            invocationCount++
        })

        await testContext.addExplorerRegion(testRegion1Value, testRegion2Value)

        assert.strictEqual(invocationCount, 1)
    })

    it('fires event on profile change', async () => {

        const testContext = new DefaultAwsContext(
            new ContextTestsSettingsConfigurationBase(),
            new FakeExtensionContext()
        )

        let invocationCount = 0
        testContext.onDidChangeContext((c) => {
            assert.strictEqual(c.profileName, testProfileValue)
            invocationCount++
        })

        await testContext.setCredentialProfileName(testProfileValue)

        assert.strictEqual(invocationCount, 1)
    })
})
