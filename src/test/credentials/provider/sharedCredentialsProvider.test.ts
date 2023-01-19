/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import { SharedCredentialsProvider } from '../../../credentials/providers/sharedCredentialsProvider'
import { Profile } from '../../../shared/credentials/credentialsFile'
import { stripUndefined } from '../../../shared/utilities/collectionUtils'
import * as process from '@aws-sdk/credential-provider-process'
import { ParsedIniData } from '@aws-sdk/shared-ini-file-loader'
import { installFakeClock } from '../../testUtil'

const missingPropertiesFragment = 'missing properties'

describe('SharedCredentialsProvider', async function () {
    let clock: FakeTimers.InstalledClock
    let sandbox: sinon.SinonSandbox

    before(function () {
        sandbox = sinon.createSandbox()
        clock = installFakeClock()
    })

    after(function () {
        clock.uninstall()
    })

    afterEach(function () {
        clock.reset()
        sandbox.restore()
    })

    it('constructor fails if profile does not exist', async function () {
        assert.throws(() => {
            // @ts-ignore - sut is unused, we expect the constructor to throw
            const sut = new SharedCredentialsProvider(
                'some-other-profile',
                new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }]])
            )
        })
    })

    it('produces a CredentialsProviderId', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }]])
        )

        assert.deepStrictEqual(sut.getCredentialsId(), {
            credentialSource: 'profile',
            credentialTypeId: 'default',
        })
    })

    it('gets profile properties', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([
                ['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y', region: 'foo' }],
            ])
        )

        assert.strictEqual(sut.getDefaultRegion(), 'foo')
        assert.strictEqual(await sut.canAutoConnect(), true)
    })

    it('profile properties may be undefined', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }]])
        )

        assert.strictEqual(sut.getDefaultRegion(), undefined)
    })

    it('validation identifies a source_profile reference that does not exist', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { role_arn: 'x', source_profile: 'fakeprofile' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'not found')
    })

    it('validation identifies a source_profile reference cycle', async function () {
        const sut = new SharedCredentialsProvider(
            'profileA',
            new Map<string, Profile>([
                ['profileA', { role_arn: 'x', source_profile: 'profileB' }],
                ['profileB', { role_arn: 'x', source_profile: 'profileC' }],
                ['profileC', { role_arn: 'x', source_profile: 'profileA' }],
            ])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'Cycle detected', 'profileA', 'profileB', 'profileC')
    })

    it('validation identifies when access key id is missing a corresponding secret key', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), missingPropertiesFragment, 'aws_secret_access_key')
    })

    it('validation identifies when session_token is missing a corresponding access key id', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_secret_access_key: 'y', aws_session_token: 'z' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), missingPropertiesFragment, 'aws_access_key_id')
    })

    it('validation identifies when session_token is missing a corresponding secret key', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_session_token: 'z' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), missingPropertiesFragment, 'aws_secret_access_key')
    })

    it('validation identifies when the profile contains no supported properties', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { hello: 'world' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'not supported')
    })

    it('validation identifies an invalid credential_source', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { credential_source: 'invalidSource' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'is not supported', 'invalidSource')
    })

    it('validation identifies credential_source and source_profile both set', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { credential_source: 'EcsContainer', source_profile: 'profile' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'cannot both be set')
    })

    it('validates a valid profile with an access key', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }]])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with a session token', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([
                ['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y', aws_session_token: 'z' }],
            ])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with credential_process', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { credential_process: 'x' }]])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with role_arn', async function () {
        const sut = new SharedCredentialsProvider('default', new Map<string, Profile>([['default', { role_arn: 'x' }]]))

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with role_arn and source_profile', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([
                ['default', { role_arn: 'x', source_profile: 'B' }],
                ['B', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }],
            ])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with credential_source', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { credential_source: 'EcsContainer' }]])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('isAvailable false when the profile is not valid', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x' }]])
        )

        assert.strictEqual(await sut.isAvailable(), false)
    })

    it('getCredentials throws when unsupported credential source', async function () {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { credential_source: 'Invalid' }]])
        )
        try {
            await sut.getCredentials()
            assert.fail('expected exception')
        } catch (err) {}
    })

    describe('patchSourceCredentials', async function () {
        let childProfile: { [key: string]: string } = {}
        let resolvedBaseProfile: { [key: string]: string } = {}

        beforeEach(function () {
            childProfile = {
                source_profile: 'base',
                role_arn: 'testarn',
            }
            resolvedBaseProfile = {
                aws_access_key_id: 'id',
                aws_secret_access_key: 'secret',
            }
        })

        async function assertIniProviderResolves(
            sut: SharedCredentialsProvider,
            resolvedProfile: ParsedIniData
        ): Promise<void> {
            const makeIni = sandbox.stub(sut as any, 'makeSharedIniFileCredentialsProvider').callsFake(profile => {
                // The SDK does not care if fields are undefined, but we need to remove them to test
                stripUndefined(profile)
                assert.deepStrictEqual(profile, resolvedProfile)
                return () => Promise.resolve({})
            })

            await sut.getCredentials()
            assert.ok(makeIni.calledOnce)
        }

        it('resolves profile with source_profile as credential_process', async function () {
            const resolvedProfile = {
                base: resolvedBaseProfile,
                child: childProfile,
            }
            const sut = new SharedCredentialsProvider(
                'child',
                new Map<string, Profile>([
                    ['base', { credential_process: 'test_process' }],
                    ['child', { ...childProfile }],
                ])
            )

            sandbox.stub(process, 'fromProcess').returns(() =>
                Promise.resolve({
                    accessKeyId: resolvedBaseProfile['aws_access_key_id'],
                    secretAccessKey: resolvedBaseProfile['aws_secret_access_key'],
                })
            )

            await assertIniProviderResolves(sut, resolvedProfile)
        })

        it('resolves profile with source_profile and MFA', async function () {
            const mfaSerial = 'serial'
            const resolvedProfile = {
                base: resolvedBaseProfile,
                child: {
                    ...childProfile,
                    mfa_serial: mfaSerial,
                },
            }
            const sut = new SharedCredentialsProvider(
                'child',
                new Map<string, Profile>([
                    [
                        'base',
                        {
                            credential_process: 'test_process',
                            mfa_serial: mfaSerial,
                        },
                    ],
                    ['child', { ...childProfile }],
                ])
            )

            // We use 'credential_process' here to simulate static credentials since we can't
            // stub out 'makeSharedIniFileCredentialsProvider' as it is already stubbed
            sandbox.stub(process, 'fromProcess').returns(() =>
                Promise.resolve({
                    accessKeyId: resolvedBaseProfile['aws_access_key_id'],
                    secretAccessKey: resolvedBaseProfile['aws_secret_access_key'],
                })
            )

            await assertIniProviderResolves(sut, resolvedProfile)
        })
    })
})

function assertSubstringsInText(text: string | undefined, ...substrings: string[]) {
    assert.ok(text)
    substrings.forEach(substring => assert.notStrictEqual(text!.indexOf(substring), -1))
}
