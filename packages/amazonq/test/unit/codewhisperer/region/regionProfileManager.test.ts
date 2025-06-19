/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert, { fail } from 'assert'
import { AuthUtil, RegionProfile, RegionProfileManager, defaultServiceConfig } from 'aws-core-vscode/codewhisperer'
import { globals } from 'aws-core-vscode/shared'
import { constants } from 'aws-core-vscode/auth'
import { createTestAuthUtil } from 'aws-core-vscode/test'
import { randomUUID } from 'crypto'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'
const region = 'us-east-1'

describe('RegionProfileManager', async function () {
    let regionProfileManager: RegionProfileManager

    const profileFoo: RegionProfile = {
        name: 'foo',
        region,
        arn: 'foo arn',
        description: 'foo description',
    }

    async function setupConnection(type: 'builderId' | 'idc') {
        if (type === 'builderId') {
            await AuthUtil.instance.login(constants.builderIdStartUrl, region, 'sso')
            assert.ok(AuthUtil.instance.isSsoSession())
            assert.ok(AuthUtil.instance.isBuilderIdConnection())
        } else if (type === 'idc') {
            await AuthUtil.instance.login(enterpriseSsoStartUrl, region, 'sso')
            assert.ok(AuthUtil.instance.isSsoSession())
            assert.ok(AuthUtil.instance.isIdcConnection())
        }
    }

    beforeEach(async function () {
        await createTestAuthUtil()
        regionProfileManager = new RegionProfileManager(AuthUtil.instance)
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('list profiles', function () {
        it('should call list profiles with different region endpoints', async function () {
            await setupConnection('idc')
            const listProfilesStub = sinon.stub().returns({
                promise: () =>
                    Promise.resolve({
                        profiles: [
                            {
                                arn: 'arn',
                                profileName: 'foo',
                            },
                        ],
                    }),
            })
            const mockClient = {
                listAvailableProfiles: listProfilesStub,
            }
            const createClientStub = sinon.stub(regionProfileManager, '_createQUserClient').resolves(mockClient)

            const profileList = await regionProfileManager.listRegionProfile()

            assert.strictEqual(profileList.length, 2)
            assert.deepStrictEqual(profileList, [
                {
                    name: 'foo',
                    arn: 'arn',
                    region: 'us-east-1',
                    description: '',
                },
                {
                    name: 'foo',
                    arn: 'arn',
                    region: 'eu-central-1',
                    description: '',
                },
            ])

            assert.ok(createClientStub.calledTwice)
            assert.ok(listProfilesStub.calledTwice)
        })
    })

    describe('switch and get profile', function () {
        it('should switch if connection is IdC', async function () {
            await setupConnection('idc')
            await regionProfileManager.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(regionProfileManager.activeRegionProfile, profileFoo)
        })

        it('should do nothing and return undefined if connection is builder id', async function () {
            await setupConnection('builderId')
            await regionProfileManager.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(regionProfileManager.activeRegionProfile, undefined)
        })
    })

    describe(`client config`, function () {
        it(`no valid credential should throw`, async function () {
            await AuthUtil.instance.logout()

            assert.ok(!AuthUtil.instance.isConnected())

            assert.throws(() => {
                regionProfileManager.clientConfig
            }, /trying to get client configuration without credential/)
        })

        it(`builder id should always use default profile IAD`, async function () {
            await setupConnection('builderId')
            await regionProfileManager.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(regionProfileManager.activeRegionProfile, undefined)
            if (!AuthUtil.instance.isConnected()) {
                fail('connection should not be undefined')
            }

            assert.deepStrictEqual(regionProfileManager.clientConfig, defaultServiceConfig)
        })

        it(`idc should return correct endpoint corresponding to profile region`, async function () {
            await setupConnection('idc')
            await regionProfileManager.switchRegionProfile(
                {
                    name: 'foo',
                    region: 'eu-central-1',
                    arn: 'foo arn',
                    description: 'foo description',
                },
                'user'
            )
            assert.ok(regionProfileManager.activeRegionProfile)
            assert.deepStrictEqual(regionProfileManager.clientConfig, {
                region: 'eu-central-1',
                endpoint: 'https://q.eu-central-1.amazonaws.com/',
            })
        })

        it(`idc should throw if corresponding endpoint is not defined`, async function () {
            await setupConnection('idc')
            await regionProfileManager.switchRegionProfile(
                {
                    name: 'foo',
                    region: 'unknown region',
                    arn: 'foo arn',
                    description: 'foo description',
                },
                'user'
            )

            assert.throws(() => {
                regionProfileManager.clientConfig
            }, /Q client configuration error, endpoint not found for region*/)
        })
    })

    describe('persistSelectedRegionProfile', function () {
        it('persistSelectedRegionProfile', async function () {
            await setupConnection('idc')
            await regionProfileManager.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(regionProfileManager.activeRegionProfile, profileFoo)
            if (!AuthUtil.instance.isConnected()) {
                fail('connection should not be undefined')
            }

            await regionProfileManager.persistSelectRegionProfile()

            const state = globals.globalState.tryGet<{ [label: string]: RegionProfile }>(
                'aws.amazonq.regionProfiles',
                Object,
                {}
            )

            assert.strictEqual(state[AuthUtil.instance.profileName], profileFoo)
        })
    })

    describe('restoreRegionProfile', function () {
        beforeEach(async function () {
            await setupConnection('idc')
        })
        it('restores region profile if profile name matches', async function () {
            const state = {} as any
            state[AuthUtil.instance.profileName] = profileFoo

            await globals.globalState.update('aws.amazonq.regionProfiles', state)

            await regionProfileManager.restoreRegionProfile()

            assert.strictEqual(regionProfileManager.activeRegionProfile, profileFoo)
        })

        it('returns early when no profiles exist', async function () {
            const state = {} as any
            state[AuthUtil.instance.profileName] = undefined

            await globals.globalState.update('aws.amazonq.regionProfiles', state)

            await regionProfileManager.restoreRegionProfile()
            assert.strictEqual(regionProfileManager.activeRegionProfile, undefined)
        })

        it('returns early when no profile name matches, and multiple profiles exist', async function () {
            const state = {} as any
            state[AuthUtil.instance.profileName] = undefined
            state[randomUUID()] = profileFoo

            await globals.globalState.update('aws.amazonq.regionProfiles', state)

            await regionProfileManager.restoreRegionProfile()
            assert.strictEqual(regionProfileManager.activeRegionProfile, undefined)
        })

        it('uses single profile when no profile name matches', async function () {
            const state = {} as any
            state[randomUUID()] = profileFoo

            await globals.globalState.update('aws.amazonq.regionProfiles', state)

            await regionProfileManager.restoreRegionProfile()

            assert.strictEqual(regionProfileManager.activeRegionProfile, profileFoo)
        })

        it('handles cross-validation failure', async function () {
            const state = {
                [AuthUtil.instance.profileName]: profileFoo,
            }
            sinon.stub(regionProfileManager, 'loadPersistedRegionProfiles').returns(state)
            sinon.stub(regionProfileManager, 'getProfiles').resolves([]) // No matching profile
            const invalidateStub = sinon.stub(regionProfileManager, 'invalidateProfile')

            await regionProfileManager.restoreRegionProfile()

            assert.ok(invalidateStub.calledWith(profileFoo.arn))
        })
    })

    describe('invalidate', function () {
        it('should reset activeProfile and global state', async function () {
            // setup
            await setupConnection('idc')
            await regionProfileManager.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(regionProfileManager.activeRegionProfile, profileFoo)
            if (!AuthUtil.instance.isConnected()) {
                fail('connection should not be undefined')
            }
            await regionProfileManager.persistSelectRegionProfile()
            const state = globals.globalState.tryGet<{ [label: string]: RegionProfile }>(
                'aws.amazonq.regionProfiles',
                Object,
                {}
            )
            assert.strictEqual(state[AuthUtil.instance.profileName], profileFoo)

            // subject to test
            await regionProfileManager.invalidateProfile(profileFoo.arn)

            // assertion
            assert.strictEqual(regionProfileManager.activeRegionProfile, undefined)
            const actualGlobalState = globals.globalState.tryGet<{ [label: string]: RegionProfile }>(
                'aws.amazonq.regionProfiles',
                Object,
                {}
            )
            assert.deepStrictEqual(actualGlobalState, {})
        })
    })

    describe('createQUserClient', function () {
        it(`should configure the endpoint and region from a profile`, async function () {
            await setupConnection('idc')

            const iadClient = await regionProfileManager.createQUserClient({
                name: 'foo',
                region: 'us-east-1',
                arn: 'arn',
                description: 'description',
            })

            assert.deepStrictEqual(iadClient.config.region, 'us-east-1')
            assert.deepStrictEqual(iadClient.endpoint.href, 'https://q.us-east-1.amazonaws.com/')

            const fraClient = await regionProfileManager.createQUserClient({
                name: 'bar',
                region: 'eu-central-1',
                arn: 'arn',
                description: 'description',
            })

            assert.deepStrictEqual(fraClient.config.region, 'eu-central-1')
            assert.deepStrictEqual(fraClient.endpoint.href, 'https://q.eu-central-1.amazonaws.com/')
        })

        it(`should throw if the region is not supported or recognizable by Q`, async function () {
            await setupConnection('idc')

            await assert.rejects(
                async () => {
                    await regionProfileManager.createQUserClient({
                        name: 'foo',
                        region: 'ap-east-1',
                        arn: 'arn',
                        description: 'description',
                    })
                },
                { message: /trying to initiatize Q client with unrecognizable region/ }
            )

            await assert.rejects(
                async () => {
                    await regionProfileManager.createQUserClient({
                        name: 'foo',
                        region: 'unknown-somewhere',
                        arn: 'arn',
                        description: 'description',
                    })
                },
                { message: /trying to initiatize Q client with unrecognizable region/ }
            )
        })

        it(`should configure the endpoint and region correspondingly`, async function () {
            await setupConnection('idc')
            await regionProfileManager.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(regionProfileManager.activeRegionProfile, profileFoo)

            const client = await regionProfileManager._createQUserClient('eu-central-1', 'https://amazon.com/')

            assert.deepStrictEqual(client.config.region, 'eu-central-1')
            assert.deepStrictEqual(client.endpoint.href, 'https://amazon.com/')
        })
    })
})
