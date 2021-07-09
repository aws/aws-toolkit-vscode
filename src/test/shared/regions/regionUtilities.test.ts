/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as sinon from 'sinon'
import { AwsContext } from '../../../shared/awsContext'
import { Region } from '../../../shared/regions/endpoints'
import { RegionProvider } from '../../../shared/regions/regionProvider'
import { getRegionsForActiveCredentials } from '../../../shared/regions/regionUtilities'

describe('getRegionsForActiveCredentials', async function () {
    let sandbox: sinon.SinonSandbox
    let awsContext: AwsContext
    let regionProvider: RegionProvider

    let fnGetCredentialDefaultRegion: sinon.SinonStub<[], string | undefined>
    let fnGetPartitionId: sinon.SinonStub<[string], string | undefined>
    let fnGetRegions: sinon.SinonStub<[string], Region[]>

    const samplePartitionId = 'aws'
    const samplePartitionRegions: Region[] = [
        {
            id: 'region1',
            name: 'one',
        },
        {
            id: 'region2',
            name: 'two',
        },
    ]

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        fnGetCredentialDefaultRegion = sandbox.stub()

        fnGetPartitionId = sandbox.stub()
        fnGetPartitionId.returns(samplePartitionId)

        fnGetRegions = sandbox.stub()
        fnGetRegions.returns(samplePartitionRegions)

        awsContext = {
            getCredentialDefaultRegion: fnGetCredentialDefaultRegion,
        } as any as AwsContext

        regionProvider = {
            getPartitionId: fnGetPartitionId,
            getRegions: fnGetRegions,
        } as any as RegionProvider
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('returns regions in the same partition', async function () {
        fnGetCredentialDefaultRegion.returns(samplePartitionRegions[0].id)

        const regions = getRegionsForActiveCredentials(awsContext, regionProvider)
        assert.deepStrictEqual(regions, samplePartitionRegions)
    })

    it('defaults to the standard partition if no default region is found', async function () {
        fnGetCredentialDefaultRegion.returns('us-east-1')

        getRegionsForActiveCredentials(awsContext, regionProvider)
        assert.ok(fnGetPartitionId.alwaysCalledWith('us-east-1'), 'expected default region to be used')
    })

    it('defaults to the standard partition if default region is not recognized', async function () {
        fnGetCredentialDefaultRegion.returns('foo')

        fnGetPartitionId.reset()
        fnGetPartitionId.returns(undefined)

        getRegionsForActiveCredentials(awsContext, regionProvider)
        assert.ok(fnGetRegions.alwaysCalledWith('aws'), 'expected default partition to be used')
    })
})
