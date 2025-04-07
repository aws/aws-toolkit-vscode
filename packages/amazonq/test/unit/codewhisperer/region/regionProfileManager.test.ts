/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert, { fail } from 'assert'
import { AuthUtil, RegionProfile, RegionProfileManager, defaultServiceConfig } from 'aws-core-vscode/codewhisperer'
import { globals } from 'aws-core-vscode/shared'
import { createTestAuth } from 'aws-core-vscode/test'
import { SsoConnection } from 'aws-core-vscode/auth'

const enterpriseSsoStartUrl = 'https://enterprise.awsapps.com/start'

describe('RegionProfileManager', function () {
    let sut: RegionProfileManager
    let auth: ReturnType<typeof createTestAuth>
    let authUtil: AuthUtil

    const profileFoo: RegionProfile = {
        name: 'foo',
        region: 'us-east-1',
        arn: 'foo arn',
        description: 'foo description',
    }

    async function setupConnection(type: 'builderId' | 'idc') {
        if (type === 'builderId') {
            await authUtil.connectToAwsBuilderId()
            const conn = authUtil.conn
            assert.strictEqual(conn?.type, 'sso')
            assert.strictEqual(conn.label, 'AWS Builder ID')
        } else if (type === 'idc') {
            await authUtil.connectToEnterpriseSso(enterpriseSsoStartUrl, 'us-east-1')
            const conn = authUtil.conn
            assert.strictEqual(conn?.type, 'sso')
            assert.strictEqual(conn.label, 'IAM Identity Center (enterprise)')
        }
    }

    beforeEach(function () {
        auth = createTestAuth(globals.globalState)
        authUtil = new AuthUtil(auth)
        sut = new RegionProfileManager(() => authUtil.conn)
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
            const createClientStub = sinon.stub(sut, 'createQClient').resolves(mockClient)

            const r = await sut.listRegionProfile()

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
            await sut.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(sut.activeRegionProfile, profileFoo)
        })

        it('should do nothing and return undefined if connection is builder id', async function () {
            await setupConnection('builderId')
            await sut.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(sut.activeRegionProfile, undefined)
        })
    })

    describe(`client config`, function () {
        it(`no valid credential should throw`, async function () {
            assert.ok(authUtil.conn === undefined)

            assert.throws(() => {
                sut.clientConfig
            }, /trying to get client configuration without credential/)
        })

        it(`builder id should always use default profile IAD`, async function () {
            await setupConnection('builderId')
            await sut.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(sut.activeRegionProfile, undefined)
            const conn = authUtil.conn
            if (!conn) {
                fail('connection should not be undefined')
            }

            assert.deepStrictEqual(sut.clientConfig, defaultServiceConfig)
        })

        it(`idc should return correct endpoint corresponding to profile region`, async function () {
            await setupConnection('idc')
            await sut.switchRegionProfile(
                {
                    name: 'foo',
                    region: 'eu-central-1',
                    arn: 'foo arn',
                    description: 'foo description',
                },
                'user'
            )
            assert.ok(sut.activeRegionProfile)
            assert.deepStrictEqual(sut.clientConfig, {
                region: 'eu-central-1',
                endpoint: 'https://q.eu-central-1.amazonaws.com/',
            })
        })

        it(`idc should throw if corresponding endpoint is not defined`, async function () {
            await setupConnection('idc')
            await sut.switchRegionProfile(
                {
                    name: 'foo',
                    region: 'unknown region',
                    arn: 'foo arn',
                    description: 'foo description',
                },
                'user'
            )

            assert.throws(() => {
                sut.clientConfig
            }, /Q client configuration error, endpoint not found for region*/)
        })
    })

    describe('persistence', function () {
        it('persistSelectedRegionProfile', async function () {
            await setupConnection('idc')
            await sut.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(sut.activeRegionProfile, profileFoo)
            const conn = authUtil.conn
            if (!conn) {
                fail('connection should not be undefined')
            }

            await sut.persistSelectRegionProfile()

            const state = globals.globalState.tryGet<{ [label: string]: RegionProfile }>(
                'aws.amazonq.regionProfiles',
                Object,
                {}
            )

            assert.strictEqual(state[conn.id], profileFoo)
        })

        it(`restoreRegionProfile`, async function () {
            sinon.stub(sut, 'listRegionProfile').resolves([profileFoo])
            await setupConnection('idc')
            const conn = authUtil.conn
            if (!conn) {
                fail('connection should not be undefined')
            }

            const state = {} as any
            state[conn.id] = profileFoo

            await globals.globalState.update('aws.amazonq.regionProfiles', state)

            await sut.restoreRegionProfile(conn)

            assert.strictEqual(sut.activeRegionProfile, profileFoo)
        })
    })

    describe('invalidate', function () {
        it('should reset activeProfile and global state', async function () {
            // setup
            await setupConnection('idc')
            await sut.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(sut.activeRegionProfile, profileFoo)
            const conn = authUtil.conn
            if (!conn) {
                fail('connection should not be undefined')
            }
            await sut.persistSelectRegionProfile()
            const state = globals.globalState.tryGet<{ [label: string]: RegionProfile }>(
                'aws.amazonq.regionProfiles',
                Object,
                {}
            )
            assert.strictEqual(state[conn.id], profileFoo)

            // subject to test
            await sut.invalidateProfile(profileFoo.arn)

            // assertion
            assert.strictEqual(sut.activeRegionProfile, undefined)
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
            await sut.switchRegionProfile(profileFoo, 'user')
            assert.deepStrictEqual(sut.activeRegionProfile, profileFoo)
            const conn = authUtil.conn as SsoConnection

            const client = await sut.createQClient('eu-central-1', 'https://amazon.com/', conn)

            assert.deepStrictEqual(client.config.region, 'eu-central-1')
            assert.deepStrictEqual(client.endpoint.href, 'https://amazon.com/')
        })
    })
})
