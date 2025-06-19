/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { AppDetails, SpaceDetails, DescribeDomainCommandOutput } from '@aws-sdk/client-sagemaker'
import { DescribeDomainResponse } from '@amzn/sagemaker-client'
import { intoCollection } from '../../../shared/utilities/collectionUtils'

describe('SagemakerClient.fetchSpaceAppsAndDomains', function () {
    const region = 'test-region'
    let client: SagemakerClient
    let listAppsStub: sinon.SinonStub

    const appDetails: AppDetails[] = [
        { AppName: 'app1', DomainId: 'domain1', SpaceName: 'space1' },
        { AppName: 'app2', DomainId: 'domain2', SpaceName: 'space2' },
        { AppName: 'app3', DomainId: 'domain2', SpaceName: 'space3' },
    ]

    const spaceDetails: SpaceDetails[] = [
        { SpaceName: 'space1', DomainId: 'domain1' },
        { SpaceName: 'space2', DomainId: 'domain2' },
        { SpaceName: 'space3', DomainId: 'domain2' },
        { SpaceName: 'space4', DomainId: 'domain3' },
    ]

    const domain1: DescribeDomainResponse = { DomainId: 'domain1', DomainName: 'domainName1' }
    const domain2: DescribeDomainResponse = { DomainId: 'domain2', DomainName: 'domainName2' }
    const domain3: DescribeDomainResponse = {
        DomainId: 'domain3',
        DomainName: 'domainName3',
        DomainSettings: { UnifiedStudioSettings: { DomainId: 'unifiedStudioDomain1' } },
    }

    beforeEach(function () {
        client = new SagemakerClient(region)

        listAppsStub = sinon.stub(client, 'listApps').returns(intoCollection([appDetails]))
        sinon.stub(client, 'listSpaces').returns(intoCollection([spaceDetails]))
        sinon.stub(client, 'describeDomain').callsFake(async ({ DomainId }) => {
            switch (DomainId) {
                case 'domain1':
                    return domain1 as DescribeDomainCommandOutput
                case 'domain2':
                    return domain2 as DescribeDomainCommandOutput
                case 'domain3':
                    return domain3 as DescribeDomainCommandOutput
                default:
                    return {} as DescribeDomainCommandOutput
            }
        })
    })

    afterEach(function () {
        sinon.restore()
    })

    it('returns a map of space details with corresponding app details', async function () {
        const [spaceApps, domains] = await client.fetchSpaceAppsAndDomains()

        assert.strictEqual(spaceApps.size, 3)
        assert.strictEqual(domains.size, 3)

        const spaceAppKey1 = 'domain1__space1'
        const spaceAppKey2 = 'domain2__space2'
        const spaceAppKey3 = 'domain2__space3'

        assert.ok(spaceApps.has(spaceAppKey1), 'Expected spaceApps to have key for domain1__space1')
        assert.ok(spaceApps.has(spaceAppKey2), 'Expected spaceApps to have key for domain2__space2')
        assert.ok(spaceApps.has(spaceAppKey3), 'Expected spaceApps to have key for domain2__space3')

        assert.deepStrictEqual(spaceApps.get(spaceAppKey1)?.App?.AppName, 'app1')
        assert.deepStrictEqual(spaceApps.get(spaceAppKey2)?.App?.AppName, 'app2')
        assert.deepStrictEqual(spaceApps.get(spaceAppKey3)?.App?.AppName, 'app3')

        const domainKey1 = 'domain1'
        const domainKey2 = 'domain2'

        assert.ok(domains.has(domainKey1), 'Expected domains to have key for domain1')
        assert.ok(domains.has(domainKey2), 'Expected domains to have key for domain2')

        assert.deepStrictEqual(domains.get(domainKey1)?.DomainName, 'domainName1')
        assert.deepStrictEqual(domains.get(domainKey2)?.DomainName, 'domainName2')
    })

    it('returns map even if some spaces have no matching apps', async function () {
        listAppsStub.returns(intoCollection([{ AppName: 'app1', DomainId: 'domain1', SpaceName: 'space1' }]))

        const [spaceApps] = await client.fetchSpaceAppsAndDomains()
        for (const space of spaceApps) {
            console.log(space[0])
            console.log(space[1])
        }

        const spaceAppKey2 = 'domain2__space2'
        const spaceAppKey3 = 'domain2__space3'

        assert.strictEqual(spaceApps.size, 3)
        assert.strictEqual(spaceApps.get(spaceAppKey2)?.App, undefined)
        assert.strictEqual(spaceApps.get(spaceAppKey3)?.App, undefined)
    })
})
