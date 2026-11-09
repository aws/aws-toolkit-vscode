/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { makeEndpointsProvider } from '../extension'
import { RegionProvider } from '../shared/regions/regionProvider'
import globals from '../shared/extensionGlobals'
import path from 'path'
import { TestFolder } from '../test/testUtil'

describe('Region Provider', async function () {
    let tempFolder: TestFolder

    before(async () => {
        tempFolder = await TestFolder.create()
    })

    it('resolves from remote', async function () {
        /**
         * Make sure the local file doesn't resolve to any endpoints.
         * That way we can make sure remote contents are fetched
         */
        await tempFolder.write('foo.json', '{}')
        globals.manifestPaths.endpoints = path.join(tempFolder.path, 'foo.json')

        await assert.doesNotReject(async () => {
            const endpointProvider = makeEndpointsProvider()
            const regionProvider = new RegionProvider()
            await regionProvider.init(endpointProvider)

            // regions loaded from the remote
            assert.ok(regionProvider.getRegions().length > 0)
        })
    })
})
