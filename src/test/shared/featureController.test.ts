/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { FeatureController } from '../../shared/featureController'
import { TestSettingsConfiguration } from '../utilities/testSettingsConfiguration'

describe('FeatureController', async () => {

    describe('isFeatureActive', async () => {

        it('returns true if feature is declared active and is present in settings.json', async () => {
            // simulate settings.json
            const config = new TestSettingsConfiguration()
            const flag = 'myFlag'
            await config.writeSetting('experimentalFeatureFlags', [flag])

            // simulate active feature flags
            const features = new FeatureController(config, [flag])

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
                const features = new FeatureController(config, [flag])

                assert.ok(features.isFeatureActive(flag))
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
                const features = new FeatureController(config, [flag, notFlag])

                assert.ok(features.isFeatureActive(flag))
                assert.strictEqual(features.isFeatureActive(notFlag), false)
            }
        )

        it('throws an error if too many features are registered', () => {
            const config = new TestSettingsConfiguration()
            assert.throws(() => new FeatureController(config, ['1', '2', '3', '4', '5', '6']))
        })
    })
})
