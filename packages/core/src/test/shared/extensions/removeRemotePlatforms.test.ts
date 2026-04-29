/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import { RemoteSshSettings } from '../../../shared/extensions/ssh'
import { TestSettings } from '../../utilities/testSettingsConfiguration'

const sagemakerPredicate = (h: string) => /^smc?_|^smhpc?_/.test(h)

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

            const removed = await sut.removeRemotePlatforms(sagemakerPredicate)
            assert.strictEqual(removed, 2)

            const updated = testSettings.get('remote.SSH.remotePlatform')
            assert.deepStrictEqual(updated, { other_host: 'linux' })
        })

        it('returns 0 when no entries match', async function () {
            await testSettings.update('remote.SSH.remotePlatform', {
                other_host: 'linux',
            })

            const removed = await sut.removeRemotePlatforms(sagemakerPredicate)
            assert.strictEqual(removed, 0)
        })

        it('returns 0 when remotePlatform is empty', async function () {
            await testSettings.update('remote.SSH.remotePlatform', {})

            const removed = await sut.removeRemotePlatforms(sagemakerPredicate)
            assert.strictEqual(removed, 0)
        })

        it('removes all SageMaker entries across all prefixes', async function () {
            await testSettings.update('remote.SSH.remotePlatform', {
                sm_dl_host1: 'linux',
                smc_dl_host2: 'linux',
                smhp_host3: 'linux',
                smhpc_host4: 'linux',
            })

            const removed = await sut.removeRemotePlatforms(sagemakerPredicate)
            assert.strictEqual(removed, 4)

            const updated = testSettings.get('remote.SSH.remotePlatform')
            assert.deepStrictEqual(updated, {})
        })

        it('does not remove non-SageMaker entries starting with sm', async function () {
            await testSettings.update('remote.SSH.remotePlatform', {
                'smart-home': 'linux',
                smtp_server: 'linux',
                sm_dl_host1: 'linux',
            })

            const removed = await sut.removeRemotePlatforms(sagemakerPredicate)
            assert.strictEqual(removed, 1)

            const updated = testSettings.get('remote.SSH.remotePlatform')
            assert.deepStrictEqual(updated, { 'smart-home': 'linux', smtp_server: 'linux' })
        })
    })
})
