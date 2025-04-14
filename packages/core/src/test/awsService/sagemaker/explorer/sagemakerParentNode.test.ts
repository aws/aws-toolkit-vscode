/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import { SagemakerClient, SagemakerSpaceApp } from '../../../../shared/clients/sagemaker'
import { SagemakerParentNode } from '../../../../awsService/sagemaker/explorer/sagemakerParentNode'
import { assertNodeListOnlyHasPlaceholderNode } from '../../../utilities/explorerNodeAssertions'
import assert from 'assert'

describe('sagemakerParentNode', function () {
    let testNode: SagemakerParentNode
    let client: SagemakerClient
    let fetchSpaceAppsStub: sinon.SinonStub<[], Promise<Map<string, SagemakerSpaceApp>>>
    const testRegion = 'testRegion'

    before(function () {
        client = new SagemakerClient(testRegion)
    })

    beforeEach(function () {
        fetchSpaceAppsStub = sinon.stub(SagemakerClient.prototype, 'fetchSpaceApps')
        testNode = new SagemakerParentNode(testRegion, client)
    })

    afterEach(function () {
        fetchSpaceAppsStub.restore()
    })

    after(function () {
        sinon.restore()
    })

    it('returns placeholder node if no children are present', async function () {
        fetchSpaceAppsStub.returns(Promise.resolve(new Map<string, SagemakerSpaceApp>()))
        const childNodes = await testNode.getChildren()
        assertNodeListOnlyHasPlaceholderNode(childNodes)
        fetchSpaceAppsStub.restore()
    })

    it('has child nodes', async function () {
        const spaceApps: SagemakerSpaceApp[] = [
            { SpaceName: 'name1', DomainId: 'domain1' },
            { SpaceName: 'name2', DomainId: 'domain2' },
        ]

        const spaceAppsMap = new Map<string, SagemakerSpaceApp>()
        for (const space of spaceApps) {
            spaceAppsMap.set(`${space.DomainId}-${space.SpaceName}` as string, space)
        }

        fetchSpaceAppsStub.returns(Promise.resolve(spaceAppsMap))
        const childNodes = await testNode.getChildren()
        assert.strictEqual(childNodes.length, spaceApps.length, 'Unexpected child count')
        fetchSpaceAppsStub.restore()
    })
})
