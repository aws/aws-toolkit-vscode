/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as sinon from 'sinon'
import { DefaultRegionProvider } from '../../../shared/regions/defaultRegionProvider'
import { Endpoints } from '../../../shared/regions/endpoints'
import { EndpointsProvider } from '../../../shared/regions/endpointsProvider'
import { ResourceFetcher } from '../../../shared/resourcefetcher/resourcefetcher'

const sampleEndpoints = {
    partitions: [
        {
            partition: 'aws',
            partitionName: 'Standard',
            regions: {
                region1: {
                    description: 'aws region one'
                },
                region2: {
                    description: 'aws region two'
                },
                region3: {
                    description: 'aws region three'
                }
            }
        },
        {
            partition: 'aws-cn',
            partitionName: 'China',
            regions: {
                awscnregion1: {
                    description: 'aws-cn region one'
                }
            }
        }
    ]
}

describe('DefaultRegionProvider', async () => {
    const resourceFetcher: ResourceFetcher = {
        get: async () => {
            return JSON.stringify(sampleEndpoints)
        }
    }

    it('returns region data', async () => {
        const endpointsProvider = new EndpointsProvider(resourceFetcher, resourceFetcher)
        await endpointsProvider.load()

        const regionProvider = new DefaultRegionProvider(endpointsProvider)

        const regions = await regionProvider.getRegionData()

        assert.strictEqual(regions.length, 3, 'Expected to retrieve three regions')

        for (const expectedRegionId of ['region1', 'region2', 'region3']) {
            assert.ok(
                regions.some(r => r.regionCode === expectedRegionId),
                `${expectedRegionId} was missing from retrieved regions`
            )
        }
    })

    describe('isServiceInRegion', async () => {
        let sandbox: sinon.SinonSandbox

        let endpoints: Endpoints
        let endpointsProvider: EndpointsProvider

        const regionCode = 'someRegion'
        const serviceId = 'someService'

        beforeEach(() => {
            sandbox = sinon.createSandbox()

            endpoints = {
                partitions: [
                    {
                        id: 'aws',
                        name: '',
                        regions: [
                            {
                                id: regionCode,
                                description: ''
                            }
                        ],
                        services: [
                            {
                                id: serviceId,
                                endpoints: [
                                    {
                                        regionId: regionCode,
                                        data: {}
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }

            endpointsProvider = new EndpointsProvider(resourceFetcher, resourceFetcher)
            sandbox.stub(endpointsProvider, 'getEndpoints').returns(endpoints)
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('indicates when a service is in a region', async () => {
            const regionProvider = new DefaultRegionProvider(endpointsProvider)

            assert.ok(regionProvider.isServiceInRegion(serviceId, regionCode), 'Expected service to be in region')
        })

        it('indicates when a service is not in a region', async () => {
            const regionProvider = new DefaultRegionProvider(endpointsProvider)

            assert.ok(
                !regionProvider.isServiceInRegion(`${serviceId}x`, regionCode),
                'Expected service not to be in region'
            )
        })
    })
})
