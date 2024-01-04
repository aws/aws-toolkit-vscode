/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { FeatureConfigProvider, featureDefinitions } from '../../../codewhisperer/service/featureConfigProvider'
import { createSpyClient } from '../testUtil'
import sinon from 'sinon'
import {
    FeatureEvaluation,
    ListFeatureEvaluationsResponse,
} from '../../../codewhisperer/client/codewhispereruserclient'
import { AWSError, Request } from 'aws-sdk'

describe('CodeWhispererFeatureConfigServiceTest', () => {
    afterEach(function () {
        sinon.restore()
    })

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

    it('test getFeatureConfigsTelemetry will return expected string', async () => {
        const testFeatureContext = {
            feature: 'testFeature',
            variation: 'TREATMENT',
            value: 'testValue',
        } as FeatureEvaluation

        const clientSpy = await createSpyClient()
        sinon.stub(clientSpy, 'listFeatureEvaluations').returns({
            promise: () =>
                Promise.resolve({
                    $response: {
                        requestId: '',
                    },
                    featureEvaluations: [testFeatureContext],
                }),
        } as Request<ListFeatureEvaluationsResponse, AWSError>)

        await FeatureConfigProvider.instance.fetchFeatureConfigs()
        assert.strictEqual(
            FeatureConfigProvider.instance.getFeatureConfigsTelemetry(),
            `{${testFeatureContext.feature}: ${testFeatureContext.variation}}`
        )
    })
})
