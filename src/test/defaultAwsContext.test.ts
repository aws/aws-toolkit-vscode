/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { DefaultAwsContext } from '../shared/defaultAwsContext'
import { SettingsConfiguration } from '../shared/settingsConfiguration'
import { ConfigurationTarget } from 'vscode'
import { regionSettingKey, profileSettingKey } from '../shared/constants'

suite("AWSContext Tests", function (): void {

    const testRegion1Value: string = 're-gion-1'
    const testRegion2Value: string = 're-gion-2'
    const testProfileValue: string = 'profile1'

    class ContextTestsSettingsConfigurationBase implements SettingsConfiguration {
        readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
            return undefined
        }
        async writeSetting<T>(settingKey: string, value: T | undefined, target: ConfigurationTarget): Promise<void> {
        }
    }


    test('context reads profile from config on startup', function () {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
                if (settingKey === profileSettingKey) {
                    return <T><any>testProfileValue
                }

                return super.readSetting(settingKey, defaultValue)
            }

        }

        const testContext = new DefaultAwsContext(new TestConfiguration())
        assert.equal(testContext.getCredentialProfileName(), testProfileValue)
    })

    test('context gets single region from config on startup', async function () {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
                if (settingKey === regionSettingKey) {
                    return <T><any>[testRegion1Value]
                }

                return super.readSetting(settingKey, defaultValue)
            }
        }


        const testContext = new DefaultAwsContext(new TestConfiguration())
        const regions = await testContext.getExplorerRegions()
        assert.equal(regions.length, 1)
        assert.equal(regions[0], testRegion1Value)
    })

    test('context gets multiple regions from config on startup', async function () {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
                if (settingKey === regionSettingKey) {
                    return <T><any>[testRegion1Value, testRegion2Value]
                }

                return super.readSetting(settingKey, defaultValue)
            }
        }


        const testContext = new DefaultAwsContext(new TestConfiguration())
        const regions = await testContext.getExplorerRegions()
        assert.equal(regions.length, 2)
        assert.equal(regions[0], testRegion1Value)
        assert.equal(regions[1], testRegion2Value)
    })

    test('context updates config on single region change', function () {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            async writeSetting<T>(settingKey: string, value: T, target: ConfigurationTarget): Promise<void> {
                assert.equal(settingKey, regionSettingKey)
                assert.equal(value, testRegion1Value)
                assert.equal(target, ConfigurationTarget.Global)
            }
        }

        const testContext = new DefaultAwsContext(new TestConfiguration())
        testContext.addExplorerRegion(testRegion1Value)
    })

    test('context updates config on multiple region change', function () {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            async writeSetting<T>(settingKey: string, value: T, target: ConfigurationTarget): Promise<void> {
                assert.equal(settingKey, regionSettingKey)
                assert(value instanceof Array)
                const values = value as any as string[]
                assert.equal(values[0], testRegion1Value)
                assert.equal(values[1], testRegion2Value)
                assert.equal(target, ConfigurationTarget.Global)
            }
        }

        const testContext = new DefaultAwsContext(new TestConfiguration())
        testContext.addExplorerRegion([testRegion1Value, testRegion2Value])
    })

    test('context updates on region removal', function () {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
                if (settingKey === regionSettingKey) {
                    return <T><any>[testRegion1Value, testRegion2Value]
                }

                return super.readSetting<T>(settingKey, defaultValue)
            }
            async writeSetting<T>(settingKey: string, value: T, target: ConfigurationTarget): Promise<void> {
                assert.equal(settingKey, regionSettingKey)
                assert.equal(value, `${testRegion2Value}`)
                assert.equal(target, ConfigurationTarget.Global)
            }
        }

        const testContext = new DefaultAwsContext(new TestConfiguration())
        testContext.removeExplorerRegion([testRegion2Value])
    })

    test('context updates config on profile change', async function () {

        class TestConfiguration extends ContextTestsSettingsConfigurationBase {
            async writeSetting<T>(settingKey: string, value: T, target: ConfigurationTarget): Promise<void> {
                assert.equal(settingKey, profileSettingKey)
                assert.equal(value, testProfileValue)
                assert.equal(target, ConfigurationTarget.Global)
            }
        }

        const testContext = new DefaultAwsContext(new TestConfiguration())
        await testContext.setCredentialProfileName(testProfileValue)
    })

    test('context fires event on single region change', function (done) {

        const testContext = new DefaultAwsContext(new ContextTestsSettingsConfigurationBase())

        testContext.onDidChangeContext((c) => {
            assert.equal(c.regions.length, 1)
            assert.equal(c.regions[0], testRegion1Value)
            done()
        })

        testContext.addExplorerRegion(testRegion1Value)
    })

    test('context fires event on multi region change', function (done) {

        const testContext = new DefaultAwsContext(new ContextTestsSettingsConfigurationBase())

        testContext.onDidChangeContext((c) => {
            assert.equal(c.regions.length, 2)
            assert.equal(c.regions[0], testRegion1Value)
            assert.equal(c.regions[1], testRegion2Value)
            done()
        })

        testContext.addExplorerRegion([testRegion1Value, testRegion2Value])
    })

    test('context fires event on profile change', function (done) {

        const testContext = new DefaultAwsContext(new ContextTestsSettingsConfigurationBase())

        testContext.onDidChangeContext((c) => {
            assert.equal(c.profileName, testProfileValue)
            done()
        })

        testContext.setCredentialProfileName(testProfileValue)
    })
})
