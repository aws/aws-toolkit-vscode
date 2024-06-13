/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as fs from 'fs-extra'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../../shared/filesystemUtilities'
import { getRegistrationCache, getTokenCache } from '../../../auth/sso/cache'

describe('SSO Cache', function () {
    const region = 'dummyRegion'
    const startUrl = 'https://123456.awsapps.com/start'
    const hourInMs = 3600000

    let testDir: string

    const validRegistration = {
        clientId: 'dummyId',
        clientSecret: 'dummySecret',
        expiresAt: new Date(Date.now() + hourInMs),
        startUrl,
    }

    const validToken = {
        accessToken: 'longstringofrandomcharacters',
        expiresAt: new Date(Date.now() + hourInMs),
    }

    beforeEach(async function () {
        testDir = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        await tryRemoveFolder(testDir)
    })

    describe('Registration', function () {
        let cache: ReturnType<typeof getRegistrationCache>

        beforeEach(async function () {
            cache = getRegistrationCache(testDir)
        })

        it('caches based off region', async function () {
            await cache.save({ startUrl, region }, validRegistration)

            const cachedPath = path.join(testDir, `aws-toolkit-vscode-client-id-${region}.json`)
            const contents = await fs.readFile(cachedPath, 'utf-8')

            assert.deepStrictEqual(JSON.parse(contents), {
                ...validRegistration,
                expiresAt: validRegistration.expiresAt.toISOString(),
            })

            assert.deepStrictEqual(await cache.load({ startUrl, region }), validRegistration)
        })
    })

    describe('Token', function () {
        let cache: ReturnType<typeof getTokenCache>

        beforeEach(async function () {
            cache = getTokenCache(testDir)
        })

        it('caches based off start URL', async function () {
            await cache.save(startUrl, { region, startUrl, token: validToken })

            // SHA-1 hash of the encoded start URL `https://123456.awsapps.com/start`
            const cachedPath = path.join(testDir, 'c1ac99f782ad92755c6de8647b510ec247330ad1.json')
            const contents = await fs.readFile(cachedPath, 'utf-8')

            assert.deepStrictEqual(JSON.parse(contents), {
                region,
                startUrl,
                ...validToken,
                expiresAt: validToken.expiresAt.toISOString(),
            })

            assert.deepStrictEqual(await cache.load(startUrl), {
                region,
                startUrl,
                token: validToken,
                registration: undefined,
            })
        })
    })
})
