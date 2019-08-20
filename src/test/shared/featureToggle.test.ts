/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    ActiveFeatureKeys,
    FeatureToggle
} from '../../shared/featureToggle'
import { TestSettingsConfiguration } from '../utilities/testSettingsConfiguration'

describe('FeatureToggle', async () => {

    describe('isFeatureActive', async () => {

        it('returns true if feature is declared active and is present in settings.json', async () => {
            // simulate settings.json
            const config = new TestSettingsConfiguration()
            const flag = 'myFlag'
            await config.writeSetting('experimentalFeatureFlags', [flag])

            // simulate active feature flags
            const features = new FeatureToggle(config, [flag])

            assert.ok(features.isFeatureActive(flag))
        })

        it(
            'returns false for features that are not declared as active feature keys but are present in settings.json',
            async () => {
                // simulate settings.json
                const config = new TestSettingsConfiguration()
                const flag = 'myFlag'
                const notFlag = 'notMyFlag'
                await config.writeSetting('experimentalFeatureFlags', [flag, notFlag])

                // simulate active feature flags
                const features = new FeatureToggle(config, [flag])
                assert.strictEqual(features.isFeatureActive(notFlag), false)
            }
        )

        it(
            'returns false for features that are declared as active feature keys but are not active in settings.json',
            async () => {
                // simulate settings.json
                const config = new TestSettingsConfiguration()
                const flag = 'myFlag'
                const notFlag = 'notMyFlag'
                await config.writeSetting('experimentalFeatureFlags', [flag])

                // simulate active feature flags
                const features = new FeatureToggle(config, [flag, notFlag])

                assert.strictEqual(features.isFeatureActive(notFlag), false)
            }
        )

        it('throws an error if too many features are registered', () => {
            const config = new TestSettingsConfiguration()
            assert.throws(() => new FeatureToggle(config, ['1', '2', '3', '4', '5', '6']))
        })

        // Generated tests which ensure current list of enums are working
        for (const featureFlag of Object.keys(ActiveFeatureKeys)) {
            it(`returns true for currently-active feature: ${featureFlag}`, async () => {
                // simulate settings.json
                const config = new TestSettingsConfiguration()
                await config.writeSetting('experimentalFeatureFlags', [featureFlag])

                // use active feature flags from enum
                const features = new FeatureToggle(config)

                assert.ok(
                    features.isFeatureActive(featureFlag),
                    `Expected ${featureFlag} from ActiveFeatureKeys to be active`
                )
            })
        }
    })
})
