/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { CloudFormationRegionManager } from '../../../../awsService/cloudformation/explorer/regionManager'
import { RegionProvider } from '../../../../shared/regions/regionProvider'

describe('CloudFormationRegionManager', function () {
    let sandbox: sinon.SinonSandbox
    let mockRegionProvider: RegionProvider
    let regionManager: CloudFormationRegionManager

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        mockRegionProvider = {
            getRegions: () => [
                { id: 'us-east-1', name: 'US East (N. Virginia)' },
                { id: 'us-west-2', name: 'US West (Oregon)' },
            ],
        } as any
        regionManager = new CloudFormationRegionManager(mockRegionProvider)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('getSelectedRegion', function () {
        it('should return a region string', function () {
            const region = regionManager.getSelectedRegion()
            assert(typeof region === 'string')
        })
    })

    describe('updateSelectedRegion', function () {
        it('should accept a region string', async function () {
            const testRegion = 'us-east-1'
            await regionManager.updateSelectedRegion(testRegion)
            // Test passes if no error thrown
            assert(true)
        })
    })
})
