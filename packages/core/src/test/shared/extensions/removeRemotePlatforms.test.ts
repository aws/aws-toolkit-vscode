/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { RemoteSshSettings } from '../../../shared/extensions/ssh'
import { TestSettings } from '../../utilities/testSettingsConfiguration'

describe('RemoteSshSettings', function () {
    describe('removeRemotePlatforms', function () {
        let testSettings: TestSettings
        let sut: RemoteSshSettings

        beforeEach(function () {
            testSettings = new TestSettings()
            sut = new RemoteSshSettings(testSettings)
        })

        it('removes entries matching the predicate', async function () {
            await testSettings.update('remote.SSH.remotePlatform', {
                sm_dl_host1: 'linux',
                sm_dl_host2: 'linux',
                other_host: 'linux',
            })

            const removed = await sut.removeRemotePlatforms((h) => h.startsWith('sm'))
            assert.strictEqual(removed, 2)

            const updated = testSettings.get('remote.SSH.remotePlatform')
            assert.deepStrictEqual(updated, { other_host: 'linux' })
        })

        it('returns 0 when no entries match', async function () {
            await testSettings.update('remote.SSH.remotePlatform', {
                other_host: 'linux',
            })

            const removed = await sut.removeRemotePlatforms((h) => h.startsWith('sm'))
            assert.strictEqual(removed, 0)
        })

        it('returns 0 when remotePlatform is empty', async function () {
            await testSettings.update('remote.SSH.remotePlatform', {})

            const removed = await sut.removeRemotePlatforms((h) => h.startsWith('sm'))
            assert.strictEqual(removed, 0)
        })

        it('removes all entries when all match', async function () {
            await testSettings.update('remote.SSH.remotePlatform', {
                sm_dl_host1: 'linux',
                smc_dl_host2: 'linux',
                smhp_host3: 'linux',
            })

            const removed = await sut.removeRemotePlatforms((h) => h.startsWith('sm'))
            assert.strictEqual(removed, 3)

            const updated = testSettings.get('remote.SSH.remotePlatform')
            assert.deepStrictEqual(updated, {})
        })
    })
})
