/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as AWS from 'aws-sdk'
import * as sinon from 'sinon'
import { ConfigurationTarget } from 'vscode'
import { profileSettingKey, regionSettingKey } from '../../shared/constants'
import { CredentialsManager } from '../../shared/credentialsManager'
import { DefaultAwsContext } from '../../shared/defaultAwsContext'
import { SettingsConfiguration } from '../../shared/settingsConfiguration'
import { FakeExtensionContext, FakeMementoStorage } from '../fakeExtensionContext'
import { TestSettingsConfiguration } from '../utilities/testSettingsConfiguration'
import { assertThrowsError } from './utilities/assertUtils'

describe('DefaultAwsContext', () => {
    const testRegion1Value: string = 're-gion-1'
    const testRegion2Value: string = 're-gion-2'
    const testRegion3Value: string = 're-gion-3'
    const testProfileValue: string = 'profile1'
    const testAccountIdValue: string = '123456789012'
    const testAccessKey: string = 'opensesame'
    const testSecretKey: string = 'itsasecrettoeverybody'

    class ContextTestsSettingsConfigurationBase implements SettingsConfiguration {
        public readSetting<T>(settingKey: string, defaultValue?: T): T | undefined {
            return undefined
        }

        public async writeSetting<T>(
            settingKey: string,
            value: T | undefined,
            target: ConfigurationTarget
        ): Promise<void> {}
    }

    class TestCredentialsManager extends CredentialsManager {
        public constructor(
            private readonly expectedName?: string,
            private readonly reportedCredentials?: AWS.Credentials
        ) {
            super()
        }

        public async getCredentials(profileName: string): Promise<AWS.Credentials> {
            if (this.reportedCredentials && this.expectedName === profileName) {
                return this.reportedCredentials
            }
            throw new Error()
        }
    }

    let sandbox: sinon.SinonSandbox
    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('gets credentials if a profile exists with credentials', async () => {
        const settingsConfig = new TestSettingsConfiguration()
        await settingsConfig.writeSetting<string>(profileSettingKey, testProfileValue)
        const reportedCredentials = new AWS.Credentials(testAccessKey, testSecretKey)

        const testContext = new DefaultAwsContext(
            settingsConfig,
            new FakeExtensionContext(),
            new TestCredentialsManager(testProfileValue, reportedCredentials)
        )
        const creds = await testContext.getCredentials()
        assert.strictEqual(creds, reportedCredentials)
    })

    it('gets credentials if a profile exists with credentials', async () => {
        const overrideProfile = 'asdf'
        const settingsConfig = new TestSettingsConfiguration()
        await settingsConfig.writeSetting<string>(profileSettingKey, overrideProfile)
        const reportedCredentials = new AWS.Credentials(testAccessKey, testSecretKey)

        const testContext = new DefaultAwsContext(
            settingsConfig,
            new FakeExtensionContext(),
            new TestCredentialsManager(overrideProfile, reportedCredentials)
        )
        const creds = await testContext.getCredentials(overrideProfile)
        assert.strictEqual(creds, reportedCredentials)
    })

    it('throws an error if a profile does not exist', async () => {
        const overrideProfile = 'asdf'
        const settingsConfig = new TestSettingsConfiguration()
        await settingsConfig.writeSetting<string>(profileSettingKey, overrideProfile)

        const testContext = new DefaultAwsContext(
            settingsConfig,
            new FakeExtensionContext(),
            new TestCredentialsManager(overrideProfile)
        )
        await assertThrowsError(async () => {
            await testContext.getCredentials(testProfileValue)
        })
    })

    it('returns undefined if no profile is provided and no profile was previously saved to settings', async () => {
        const settingsConfig = new TestSettingsConfiguration()

        const testContext = new DefaultAwsContext(settingsConfig, new FakeExtensionContext())
        const creds = await testContext.getCredentials()
        assert.strictEqual(creds, undefined)
    })

    it('returns ini crendentials if available', async () => {
        const settingsConfig = new TestSettingsConfiguration()
        const credentials = new AWS.Credentials(testAccessKey, testSecretKey)
        sandbox.stub(AWS, 'SharedIniFileCredentials').returns(credentials)

        const testContext = new DefaultAwsContext(settingsConfig, new FakeExtensionContext())
        const actual = await testContext.getCredentials('ini-credentials')
        assert.strictEqual(actual, credentials)
    })

    it('returns process crendentials if available', async () => {
        const settingsConfig = new TestSettingsConfiguration()
        const credentials = new AWS.Credentials(testAccessKey, testSecretKey)
        sandbox.stub(AWS, 'ProcessCredentials').returns(credentials)

        const testContext = new DefaultAwsContext(settingsConfig, new FakeExtensionContext())
        const actual = await testContext.getCredentials('proc-credentials')
        assert.strictEqual(actual, credentials)
    })

    it('reads profile from config on startup', async () => {
        const settingsConfig = new TestSettingsConfiguration()
        await settingsConfig.writeSetting<string>(profileSettingKey, testProfileValue)

        const testContext = new DefaultAwsContext(settingsConfig, new FakeExtensionContext())
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

    it('updates globalState on single region change', async () => {
        const extensionContext = new FakeExtensionContext()
        const testContext = new DefaultAwsContext(new ContextTestsSettingsConfigurationBase(), extensionContext)
        await testContext.addExplorerRegion(testRegion1Value)

        const persistedRegions = extensionContext.globalState.get<string[]>(regionSettingKey)
        assert.ok(persistedRegions, 'Expected region data to be stored in globalState')
        assert.strictEqual(persistedRegions!.length, 1)
        assert.strictEqual(persistedRegions![0], testRegion1Value)
    })

    it('updates globalState on multiple region change', async () => {
        const extensionContext = new FakeExtensionContext()
        const testContext = new DefaultAwsContext(new ContextTestsSettingsConfigurationBase(), extensionContext)
        await testContext.addExplorerRegion(testRegion1Value, testRegion2Value)

        const persistedRegions = extensionContext.globalState.get<string[]>(regionSettingKey)
        assert.ok(persistedRegions, 'Expected region data to be stored in globalState')
        assert.strictEqual(persistedRegions!.length, 2)
        assert.strictEqual(persistedRegions![0], testRegion1Value)
        assert.strictEqual(persistedRegions![1], testRegion2Value)
    })

    it('updates globalState on region removal', async () => {
        const extensionContext = new FakeExtensionContext()
        const testContext = new DefaultAwsContext(new ContextTestsSettingsConfigurationBase(), extensionContext)
        await testContext.addExplorerRegion(testRegion1Value, testRegion2Value, testRegion3Value)
        await testContext.removeExplorerRegion(testRegion2Value)

        const persistedRegions = extensionContext.globalState.get<string[]>(regionSettingKey)
        assert.ok(persistedRegions, 'Expected region data to be stored in globalState')
        assert.strictEqual(persistedRegions!.length, 2)
        assert.strictEqual(persistedRegions![0], testRegion1Value)
        assert.strictEqual(persistedRegions![1], testRegion3Value)
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

    it('updates config on account ID change', async () => {
        const testContext = new DefaultAwsContext(
            new ContextTestsSettingsConfigurationBase(),
            new FakeExtensionContext()
        )
        await testContext.setCredentialAccountId(testAccountIdValue)
        assert.strictEqual(testContext.getCredentialAccountId(), testAccountIdValue)
    })

    it('fires event on profile change', async () => {
        const testContext = new DefaultAwsContext(
            new ContextTestsSettingsConfigurationBase(),
            new FakeExtensionContext()
        )

        let invocationCount = 0
        testContext.onDidChangeContext(c => {
            assert.strictEqual(c.profileName, testProfileValue)
            invocationCount++
        })

        await testContext.setCredentialProfileName(testProfileValue)

        assert.strictEqual(invocationCount, 1)
    })

    it('fires event on accountId change', async () => {
        const testContext = new DefaultAwsContext(
            new ContextTestsSettingsConfigurationBase(),
            new FakeExtensionContext()
        )

        let invocationCount = 0
        testContext.onDidChangeContext(c => {
            assert.strictEqual(c.accountId, testAccountIdValue)
            invocationCount++
        })

        await testContext.setCredentialAccountId(testAccountIdValue)

        assert.strictEqual(invocationCount, 1)
    })
})
