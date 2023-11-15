/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { FeatureConfigProvider, featureDefinitions } from '../../../codewhisperer/service/featureConfigProvider'

describe('CodeWhispererFeatureConfigServiceTest', () => {
    it('featureDefinitions map is not empty', () => {
        assert.notStrictEqual(featureDefinitions.size, 0)
        assert.ok(featureDefinitions.has('testFeature'))
    })

    it('provider has getters for all the features', () => {
        for (const name of featureDefinitions.keys()) {
            const methodName = `get${name.charAt(0).toUpperCase() + name.slice(1)}`
            const method = Object.getOwnPropertyDescriptors(FeatureConfigProvider.prototype)[methodName]

            assert.strictEqual(method.value.name, methodName)

            assert.ok(method)
        }
    })
})
