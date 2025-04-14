/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { AppDetails, SpaceDetails } from '@aws-sdk/client-sagemaker'
import { intoCollection } from '../../../shared/utilities/collectionUtils'

describe('SagemakerClient.fetchSpaceApps', function () {
    const region = 'test-region'
    let client: SagemakerClient
    let listAppsStub: sinon.SinonStub

    const appDetails: AppDetails[] = [
        { AppName: 'app1', DomainId: 'domain1', SpaceName: 'space1' },
        { AppName: 'app2', DomainId: 'domain2', SpaceName: 'space2' },
    ]

    const spaceDetails: SpaceDetails[] = [
        { SpaceName: 'space1', DomainId: 'domain1' },
        { SpaceName: 'space2', DomainId: 'domain2' },
    ]

    beforeEach(function () {
        client = new SagemakerClient(region)

        listAppsStub = sinon.stub(client, 'listApps').returns(intoCollection([appDetails]))
        sinon.stub(client, 'listSpaces').returns(intoCollection([spaceDetails]))
    })

    afterEach(function () {
        sinon.restore()
    })

    it('returns a map of space details with corresponding app details', async function () {
        const result = await client.fetchSpaceApps()

        assert.strictEqual(result.size, 2)

        const key1 = 'domain1-space1'
        const key2 = 'domain2-space2'

        assert.ok(result.has(key1), 'Expected result to have key for domain1-space1')
        assert.ok(result.has(key2), 'Expected result to have key for domain2-space2')

        assert.deepStrictEqual(result.get(key1)?.App?.AppName, 'app1')
        assert.deepStrictEqual(result.get(key2)?.App?.AppName, 'app2')
    })

    it('returns map even if some spaces have no matching apps', async function () {
        listAppsStub.returns(intoCollection([{ AppName: 'app1', DomainId: 'domain1', SpaceName: 'space1' }]))

        const result = await client.fetchSpaceApps()
        const key2 = 'domain2-space2'

        assert.strictEqual(result.size, 2)
        assert.strictEqual(result.get(key2)?.App, undefined)
    })
})
