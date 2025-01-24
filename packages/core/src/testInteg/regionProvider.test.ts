/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { makeEndpointsProvider } from '../extension'
import { RegionProvider } from '../shared/regions/regionProvider'
import globals from '../shared/extensionGlobals'
import { makeTemporaryToolkitFolder } from '../shared/filesystemUtilities'
import { fs } from '../shared/fs/fs'
import path from 'path'

describe('Region Provider', async function () {
    let tempDir: string

    before(async () => {
        tempDir = await makeTemporaryToolkitFolder()
    })

    after(async () => {
        await fs.delete(tempDir, {
            recursive: true,
            force: true,
        })
    })

    it('resolves from remote', async function () {
        /**
         * Make sure the local file doesn't resolve to any endpoints.
         * That way we can make sure remote contents are fetched
         */
        const filePath = path.join(tempDir, 'foo.json')
        await fs.writeFile(filePath, '{}')
        globals.manifestPaths.endpoints = filePath

        await assert.doesNotReject(async () => {
            const endpointProvider = makeEndpointsProvider()
            const regionProvider = new RegionProvider()
            await regionProvider.init(endpointProvider)

            // regions loaded from the remote
            assert.ok(regionProvider.getRegions().length > 0)
        })
    })
})
