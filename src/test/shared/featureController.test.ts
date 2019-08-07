/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { FeatureController } from '../../shared/featureController'
import { TestSettingsConfiguration } from '../utilities/testSettingsConfiguration'

describe('FeatureController', async () => {

    const testConfig = new TestSettingsConfiguration()
    const activeSettingKey = 'activeSetting'
    const inactiveSettingKey = 'inactiveSetting'
    const missingSettingKey = 'missingSetting'
    const variableSettingKey = 'variableSetting'
    const permanentSettingKey = 'permanentSetting'
    const permanentMissingSettingKey = 'permanentMissingSetting'
    const permanentMissingVariableSettingKey = 'permanentMissingVariableSetting'
    await testConfig.writeSetting(`toggle.${activeSettingKey}`, true)
    await testConfig.writeSetting(`toggle.${inactiveSettingKey}`, false)
    await testConfig.writeSetting(`toggle.${variableSettingKey}`, false)
    await testConfig.writeSetting(`toggle.${permanentSettingKey}`, true)

    const features = new FeatureController(testConfig, [
        permanentSettingKey,
        permanentMissingSettingKey,
        permanentMissingVariableSettingKey
    ])

    it('returns whether or not a feature is active', () => {
        assert.strictEqual(features.isFeatureActive(activeSettingKey), true)
        assert.strictEqual(features.isFeatureActive(inactiveSettingKey), false)
    })

    it('returns false for features that are not present', () => {
        assert.strictEqual(features.isFeatureActive(missingSettingKey), false)
    })

    it('returns the current value of non-session-permanent features', async () => {
        assert.strictEqual(features.isFeatureActive(variableSettingKey), false)
        await testConfig.writeSetting(`toggle.${variableSettingKey}`, true)
        assert.strictEqual(features.isFeatureActive(variableSettingKey), true)
    })

    it(
        'returns the current value of non-session-permanent features that are not present at launch but later set',
        async () => {
            assert.strictEqual(features.isFeatureActive(missingSettingKey), false)
            await testConfig.writeSetting(`toggle.${missingSettingKey}`, true)
            assert.strictEqual(features.isFeatureActive(missingSettingKey), true)
        }
    )

    it('returns only the initial value of session-permanent features', async () => {
        assert.strictEqual(features.isFeatureActive(permanentSettingKey), true)
        await testConfig.writeSetting(`toggle.${permanentSettingKey}`, false)
        assert.strictEqual(features.isFeatureActive(permanentSettingKey), true)
    })

    it('returns false for session-permanent features that are not present', () => {
        assert.strictEqual(features.isFeatureActive(permanentMissingSettingKey), false)
    })

    it(
        'returns false for session-permanent features that are not present at launch but were changed mid-lifecycle',
        async () => {
            assert.strictEqual(features.isFeatureActive(permanentMissingVariableSettingKey), false)
            await testConfig.writeSetting(`toggle.${permanentMissingVariableSettingKey}`, true)
            assert.strictEqual(features.isFeatureActive(permanentMissingVariableSettingKey), false)
        }
    )
})
