/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { DevSettings } from '../../../shared/settings'

describe('Endpoint Configuration from Settings', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('DataZone endpoint configuration', () => {
        it('should return custom DataZone endpoint when configured', () => {
            const customEndpoint = 'https://custom-datazone.example.com'
            const getStub = sandbox.stub(DevSettings.instance, 'get')
            getStub.withArgs('endpoints', {}).returns({ datazone: customEndpoint })

            const endpoints = DevSettings.instance.get('endpoints', {})
            const datazoneEndpoint = endpoints['datazone']

            assert.strictEqual(datazoneEndpoint, customEndpoint)
        })
    })

    describe('SageMaker endpoint configuration', () => {
        it('should return custom SageMaker endpoint when configured', () => {
            const customEndpoint = 'https://custom-sagemaker.example.com'
            const getStub = sandbox.stub(DevSettings.instance, 'get')
            getStub.withArgs('endpoints', {}).returns({ sagemaker: customEndpoint })

            const endpoints = DevSettings.instance.get('endpoints', {})
            const sagemakerEndpoint = endpoints['sagemaker']

            assert.strictEqual(sagemakerEndpoint, customEndpoint)
        })
    })

    describe('Endpoint fallback behavior', () => {
        it('should construct default DataZone endpoint when custom endpoint is not set', () => {
            const getStub = sandbox.stub(DevSettings.instance, 'get')
            getStub.withArgs('endpoints', {}).returns({})

            const region = 'us-west-2'
            const endpoints = DevSettings.instance.get('endpoints', {})
            const customEndpoint = endpoints['datazone']
            const endpoint = customEndpoint || `https://datazone.${region}.api.aws`

            assert.strictEqual(endpoint, 'https://datazone.us-west-2.api.aws')
        })

        it('should construct default SageMaker endpoint when custom endpoint is not set', () => {
            const getStub = sandbox.stub(DevSettings.instance, 'get')
            getStub.withArgs('endpoints', {}).returns({})

            const region = 'us-east-1'
            const endpoints = DevSettings.instance.get('endpoints', {})
            const customEndpoint = endpoints['sagemaker']
            const endpoint = customEndpoint || `https://sagemaker.${region}.amazonaws.com`

            assert.strictEqual(endpoint, 'https://sagemaker.us-east-1.amazonaws.com')
        })

        it('should handle multiple endpoints in configuration', () => {
            const customEndpoints = {
                datazone: 'https://custom-datazone.example.com',
                sagemaker: 'https://custom-sagemaker.example.com',
            }
            const getStub = sandbox.stub(DevSettings.instance, 'get')
            getStub.withArgs('endpoints', {}).returns(customEndpoints)

            const endpoints = DevSettings.instance.get('endpoints', {})

            assert.strictEqual(endpoints['datazone'], customEndpoints.datazone)
            assert.strictEqual(endpoints['sagemaker'], customEndpoints.sagemaker)
        })
    })
})
