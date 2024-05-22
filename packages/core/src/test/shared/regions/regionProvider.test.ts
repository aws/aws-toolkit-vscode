/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { RegionProvider } from '../../../shared/regions/regionProvider'
import { createRegionPrompter } from '../../../shared/ui/common/region'
import { FakeMemento } from '../../fakeExtensionContext'
import { createQuickPickPrompterTester } from '../ui/testUtils'
import { createSsoProfile, createTestAuth } from '../../credentials/testUtil'
import { Auth } from '../../../auth/auth'
import * as extUtils from '../../../shared/extensionUtilities'
import sinon from 'sinon'

const regionCode = 'someRegion'
const serviceId = 'someService'
const endpoints = {
    partitions: [
        {
            dnsSuffix: 'totallyLegit.tld',
            id: 'aws',
            name: 'AWS',
            regions: [
                {
                    id: regionCode,
                    name: 'Some Region',
                },
            ],
            services: [
                {
                    id: serviceId,
                    endpoints: [
                        {
                            regionId: regionCode,
                            data: {},
                        },
                    ],
                },
            ],
        },
        {
            dnsSuffix: 'totallyLegit.cn',
            id: 'aws-cn',
            name: 'China',
            regions: [
                {
                    id: 'awscnregion1',
                    name: '',
                    description: 'aws-cn region one',
                },
            ],
            services: [],
        },
    ],
}

describe('RegionProvider', async function () {
    describe('fromEndpointsProvider', function () {
        it('pulls from the local source first and remote source later', async function () {
            const localEndpoints = Promise.resolve({ partitions: endpoints.partitions.slice(0, 1) })
            const remoteEndpoints = Promise.resolve(endpoints)
            const regionProvider = RegionProvider.fromEndpointsProvider({
                local: () => localEndpoints,
                remote: () => remoteEndpoints,
            })

            await localEndpoints
            assert.ok(regionProvider.isServiceInRegion(serviceId, regionCode), 'Expected service to be in region')
            assert.strictEqual(regionProvider.getPartitionId('awscnregion1'), undefined)
            await remoteEndpoints
            assert.ok(regionProvider.isServiceInRegion(serviceId, regionCode), 'Expected service to be in region')
            assert.strictEqual(regionProvider.getPartitionId('awscnregion1'), 'aws-cn')
        })
    })

    describe('isServiceInRegion', async function () {
        it('indicates when a service is in a region', async function () {
            const regionProvider = new RegionProvider(endpoints)

            assert.ok(regionProvider.isServiceInRegion(serviceId, regionCode), 'Expected service to be in region')
        })

        it('indicates when a service is not in a region', async function () {
            const regionProvider = new RegionProvider(endpoints)

            assert.ok(
                !regionProvider.isServiceInRegion(`${serviceId}x`, regionCode),
                'Expected service not to be in region'
            )
        })
    })

    describe('getDnsSuffixForRegion', async function () {
        let regionProvider: RegionProvider

        beforeEach(async function () {
            regionProvider = new RegionProvider(endpoints)
        })

        it('gets DNS suffix for a known region', async function () {
            const partitionId = regionProvider.getDnsSuffixForRegion(regionCode)
            assert.strictEqual(partitionId, 'totallyLegit.tld')
        })

        it('returns undefined for an unknown region', async function () {
            const partitionId = regionProvider.getDnsSuffixForRegion('foo')
            assert.strictEqual(partitionId, undefined)
        })
    })

    describe('getPartitionId', async function () {
        let regionProvider: RegionProvider

        beforeEach(async function () {
            regionProvider = new RegionProvider(endpoints)
        })

        it('gets partition for a known region', async function () {
            const partitionId = regionProvider.getPartitionId('awscnregion1')
            assert.strictEqual(partitionId, 'aws-cn')
        })

        it('returns undefined for an unknown region', async function () {
            const partitionId = regionProvider.getPartitionId('foo')
            assert.strictEqual(partitionId, undefined)
        })
    })

    describe('getRegions', async function () {
        let regionProvider: RegionProvider

        beforeEach(async function () {
            regionProvider = new RegionProvider(endpoints)
        })

        it('gets regions for a known partition', async function () {
            const regions = regionProvider.getRegions('aws')
            assert.deepStrictEqual(regions, [{ id: 'someRegion', name: 'Some Region' }])
        })

        it('returns empty array for an unknown partition', async function () {
            const regions = regionProvider.getRegions('foo')
            assert.strictEqual(regions?.length, 0, 'Unexpected regions returned')
        })
    })

    describe('updateExplorerRegions', function () {
        let regionProvider: RegionProvider

        beforeEach(function () {
            regionProvider = new RegionProvider(endpoints, new FakeMemento())
        })

        it('remembers saved regions', async function () {
            assert.deepStrictEqual(regionProvider.getExplorerRegions(), [])
            await regionProvider.updateExplorerRegions(['foo', 'bar'])
            assert.deepStrictEqual(regionProvider.getExplorerRegions(), ['foo', 'bar'])
        })

        it('removes duplicate regions', async function () {
            await regionProvider.updateExplorerRegions(['foo', 'bar', 'foo'])
            assert.deepStrictEqual(regionProvider.getExplorerRegions(), ['foo', 'bar'])
        })
    })

    describe('guessDefaultRegion', function () {
        afterEach(() => {
            sinon.restore()
        })

        it('sets default region to last region from prompter', async function () {
            const regionProvider = new RegionProvider()
            const originalRegion = regionProvider.guessDefaultRegion()

            const regions = [
                { id: 'us-west-2', name: 'PDX' },
                { id: 'us-east-1', name: 'IAD' },
                { id: 'foo-bar-1', name: 'FOO' },
            ]

            const p = createRegionPrompter(regions, { defaultRegion: 'foo-bar-1' })
            const tester = createQuickPickPrompterTester(p)
            const selection = regions[2]
            tester.acceptItem(selection.name)
            await tester.result(selection)

            const newRegion = regionProvider.guessDefaultRegion()
            assert.notStrictEqual(
                originalRegion,
                newRegion,
                `Region Prompter failed to update value of guessDefaultRegion from ${originalRegion}.`
            )
            assert.strictEqual(
                newRegion,
                selection.id,
                `guessDefaultRegion gave region ${newRegion} while selection is region ${selection.id}`
            )
        })

        it('prioritizes the AWS explorer region if there is only one', async function () {
            const regionProvider = new RegionProvider(endpoints, new FakeMemento())
            await regionProvider.updateExplorerRegions(['us-east-2'])
            regionProvider.setLastTouchedRegion('us-west-1')
            assert.strictEqual(regionProvider.guessDefaultRegion(), 'us-east-2')
        })

        it('returns undefined when unable to determine last used region', function () {
            const regionProvider = new RegionProvider(endpoints, new FakeMemento())
            assert.strictEqual(regionProvider.guessDefaultRegion(), undefined)
        })

        it('returns undefined when no active amazon Q connection', function () {
            const regionProvider = new RegionProvider(endpoints, new FakeMemento())
            sinon.stub(extUtils, 'isAmazonQ').returns(true)

            assert.strictEqual(regionProvider.guessDefaultRegion(), undefined)
        })

        it('returns connection region with active amazon Q connection', async function () {
            const region = 'us-west-2'
            const regionProvider = new RegionProvider(endpoints, new FakeMemento())
            const auth = createTestAuth()
            await auth.useConnection(await auth.createConnection(createSsoProfile({ ssoRegion: region })))

            sinon.stub(Auth, 'instance').value(auth)
            sinon.stub(extUtils, 'isAmazonQ').returns(true)

            assert.strictEqual(regionProvider.guessDefaultRegion(), region)
        })
    })
})
