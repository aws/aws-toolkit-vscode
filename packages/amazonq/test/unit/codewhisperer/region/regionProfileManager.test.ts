/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert, { fail } from 'assert'
import { AuthUtil, RegionProfile, RegionProfileManager, defaultServiceConfig } from 'aws-core-vscode/codewhisperer'
import { globals } from 'aws-core-vscode/shared'
import { builderIdStartUrl } from 'aws-core-vscode/auth'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'
const region = 'us-east-1'

describe('RegionProfileManager', function () {
    let regionProfileManager: RegionProfileManager

    const profileFoo: RegionProfile = {
        name: 'foo',
        region,
        arn: 'foo arn',
        description: 'foo description',
    }

    async function setupConnection(type: 'builderId' | 'idc') {
        if (type === 'builderId') {
            await AuthUtil.instance.login(builderIdStartUrl, region)
            assert.ok(AuthUtil.instance.isSsoSession())
            assert.ok(AuthUtil.instance.isBuilderIdConnection())
        } else if (type === 'idc') {
            await AuthUtil.instance.login(enterpriseSsoStartUrl, region)
            assert.ok(AuthUtil.instance.isSsoSession())
            assert.ok(AuthUtil.instance.isIdcConnection())
        }
    }

    beforeEach(function () {
        regionProfileManager = new RegionProfileManager(AuthUtil.instance)
        // const authUtilStub = sinon.stub(AuthUtil.instance, 'isIdcConnection').returns(isSso)
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
            const createClientStub = sinon.stub(regionProfileManager, 'createQClient').resolves(mockClient)

            const r = await regionProfileManager.listRegionProfiles()

            assert.strictEqual(r.length, 2)
            assert.deepStrictEqual(r, [
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

    describe('persistence', function () {
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

        it(`restoreRegionProfile`, async function () {
            sinon.stub(regionProfileManager, 'listRegionProfiles').resolves([profileFoo])
            await setupConnection('idc')
            if (!AuthUtil.instance.isConnected()) {
                fail('connection should not be undefined')
            }

            const state = {} as any
            state[AuthUtil.instance.profileName] = profileFoo

            await globals.globalState.update('aws.amazonq.regionProfiles', state)

            await regionProfileManager.restoreRegionProfile()

            assert.strictEqual(regionProfileManager.activeRegionProfile, profileFoo)
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

    describe('createQClient', function () {
        it(`should configure the endpoint and region correspondingly`, async function () {
            await setupConnection('idc')
            await regionProfileManager.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(regionProfileManager.activeRegionProfile, profileFoo)

            const client = await regionProfileManager.createQClient('eu-central-1', 'https://amazon.com/')

            assert.deepStrictEqual(client.config.region, 'eu-central-1')
            assert.deepStrictEqual(client.endpoint.href, 'https://amazon.com/')
        })
    })
})
