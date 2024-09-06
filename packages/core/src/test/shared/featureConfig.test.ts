/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { AWSError, Request } from 'aws-sdk'
import { Features, FeatureConfigProvider, featureDefinitions, FeatureName } from '../../shared/featureConfig'
import { ListFeatureEvaluationsResponse } from '../../codewhisperer'
import { createSpyClient } from '../codewhisperer/testUtil'
import { mockFeatureConfigsData } from '../fake/mockFeatureConfigData'

describe('FeatureConfigProvider', () => {
    beforeEach(async () => {
        const clientSpy = await createSpyClient()
        sinon.stub(clientSpy, 'listFeatureEvaluations').returns({
            promise: () =>
                Promise.resolve({
                    $response: {
                        requestId: '',
                    },
                    featureEvaluations: mockFeatureConfigsData,
                }),
        } as Request<ListFeatureEvaluationsResponse, AWSError>)
        await FeatureConfigProvider.instance.fetchFeatureConfigs()
    })

    afterEach(function () {
        sinon.restore()
    })

    it('featureDefinitions map is not empty', () => {
        assert.notStrictEqual(featureDefinitions.size, 0)
        assert.ok(featureDefinitions.has(Features.test))
    })

    it('provider has getters for all the features', () => {
        for (const name of featureDefinitions.keys()) {
            const methodName = `get${name.charAt(0).toUpperCase() + name.slice(1)}`
            const method = Object.getOwnPropertyDescriptors(FeatureConfigProvider.prototype)[methodName]

            assert.strictEqual(method.value.name, methodName)
            assert.ok(method)
        }
    })

    it('test getFeatureConfigsTelemetry will return expected string', async () => {
        assert.strictEqual(
            FeatureConfigProvider.instance.getFeatureConfigsTelemetry(),
            `{testFeature: TREATMENT, featureA: CONTROL, featureB: TREATMENT}`
        )
    })

    it('should should return all feature flags', async () => {
        it('should should return all feature flags', async () => {
            const featureConfigs = FeatureConfigProvider.getFeatureConfigs()
            const expectedFeatureConfigs = {
                featureA: {
                    name: 'featureA',
                    value: {
                        stringValue: 'testValue',
                    },
                    variation: 'CONTROL',
                },
                featureB: {
                    name: 'featureB',
                    value: {
                        stringValue: 'testValue',
                    },
                    variation: 'TREATMENT',
                },
                testFeature: {
                    name: 'testFeature',
                    value: {
                        stringValue: 'testValue',
                    },
                    variation: 'TREATMENT',
                },
            }

            assert.deepStrictEqual(Object.fromEntries(featureConfigs), expectedFeatureConfigs)
        })
    })

    it('should test featureA as disabled', async () => {
        assert.strictEqual(FeatureConfigProvider.isEnabled('featureA' as FeatureName), false)
    })

    it('should test featureB as enabled', async () => {
        assert.strictEqual(FeatureConfigProvider.isEnabled('featureB' as FeatureName), true)
    })

    it('should test feature-does-not-exist as disabled', async () => {
        assert.strictEqual(FeatureConfigProvider.isEnabled('feature-does-not-exist' as FeatureName), false)
    })
})
