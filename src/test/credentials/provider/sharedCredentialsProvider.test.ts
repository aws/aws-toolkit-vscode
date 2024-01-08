/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import { SharedCredentialsProvider } from '../../../auth/providers/sharedCredentialsProvider'
import { stripUndefined } from '../../../shared/utilities/collectionUtils'
import * as process from '@aws-sdk/credential-provider-process'
import { ParsedIniData } from '@smithy/shared-ini-file-loader'
import { installFakeClock } from '../../testUtil'
import { SsoClient } from '../../../auth/sso/clients'
import { stub } from '../../utilities/stubber'
import { SsoAccessTokenProvider } from '../../../auth/sso/ssoAccessTokenProvider'
import { createTestSections } from '../testUtil'

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
        const sections = await createTestSections(`
        [profile default]
        aws_access_key_id = x
        aws_secret_access_key = y
        `)
        assert.throws(() => new SharedCredentialsProvider('some-other-profile', sections))
    })

    it('produces a CredentialsProviderId', async function () {
        const sections = await createTestSections(`
        [profile default]
        aws_access_key_id = x
        aws_secret_access_key = y
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.deepStrictEqual(sut.getCredentialsId(), {
            credentialSource: 'profile',
            credentialTypeId: 'default',
        })
    })

    it('gets profile properties', async function () {
        const sections = await createTestSections(`
        [profile default]
        aws_access_key_id = x
        aws_secret_access_key = y
        region = foo
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.strictEqual(sut.getDefaultRegion(), 'foo')
        assert.strictEqual(await sut.canAutoConnect(), true)
    })

    it('profile properties may be undefined', async function () {
        const sections = await createTestSections(`
        [profile default]
        aws_access_key_id = x
        aws_secret_access_key = y
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.strictEqual(sut.getDefaultRegion(), undefined)
    })

    it('validation identifies a source_profile reference that does not exist', async function () {
        const sections = await createTestSections(`
        [profile default]
        role_arn = x
        source_profile = fakeprofile
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'not found')
    })

    it('validation identifies a source_profile reference cycle', async function () {
        const sections = await createTestSections(`
        [profile profileA]
        role_arn = x
        source_profile = profileB

        [profile profileB]
        role_arn = x
        source_profile = profileC

        [profile profileC]
        role_arn = x
        source_profile = profileA
        `)
        const sut = new SharedCredentialsProvider('profileA', sections)

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'Cycle detected', 'profileA', 'profileB', 'profileC')
    })

    it('validation identifies when access key id is missing a corresponding secret key', async function () {
        const sections = await createTestSections(`
        [profile default]
        aws_access_key_id = x
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), missingPropertiesFragment, 'aws_secret_access_key')
    })

    it('validation identifies when session_token is missing a corresponding access key id', async function () {
        const sections = await createTestSections(`
        [profile default]
        aws_secret_access_key = y
        aws_session_token = z
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), missingPropertiesFragment, 'aws_access_key_id')
    })

    it('validation identifies when session_token is missing a corresponding secret key', async function () {
        const sections = await createTestSections(`
        [profile default]
        aws_access_key_id = x
        aws_session_token = z
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), missingPropertiesFragment, 'aws_secret_access_key')
    })

    it('validation identifies when the profile contains no supported properties', async function () {
        const sections = await createTestSections(`
        [profile default]
        hello = x
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'not supported')
    })

    it('validation identifies an invalid credential_source', async function () {
        const sections = await createTestSections(`
        [profile default]
        credential_source = invalidSource
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'is not supported', 'invalidSource')
    })

    it('validation identifies credential_source and source_profile both set', async function () {
        const sections = await createTestSections(`
        [profile default]
        credential_source = EcsContainer
        source_profile = profile
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'cannot both be set')
    })

    it('validates a valid profile with an access key', async function () {
        const sections = await createTestSections(`
        [profile default]
        aws_access_key_id = x
        aws_secret_access_key = y
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with a session token', async function () {
        const sections = await createTestSections(`
        [profile default]
        aws_access_key_id = x
        aws_secret_access_key = y
        aws_session_token = z
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with credential_process', async function () {
        const sections = await createTestSections(`
        [profile default]
        credential_process = x
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with role_arn', async function () {
        const sections = await createTestSections(`
        [profile default]
        role_arn = x
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with role_arn and source_profile', async function () {
        const sections = await createTestSections(`
        [profile default]
        role_arn = x
        source_profile = B

        [profile B]
        aws_access_key_id = x
        aws_secret_access_key = y
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with credential_source', async function () {
        const sections = await createTestSections(`
        [profile default]
        credential_source = EcsContainer
        `)
        const sut = new SharedCredentialsProvider('default', sections)
        assert.strictEqual(sut.validate(), undefined)
    })

    it('isAvailable false when the profile is not valid', async function () {
        const sections = await createTestSections(`
        [profile default]
        aws_access_key_id = x
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        assert.strictEqual(await sut.isAvailable(), false)
    })

    it('getCredentials throws when unsupported credential source', async function () {
        const sections = await createTestSections(`
        [profile default]
        credential_source = invalid
        `)
        const sut = new SharedCredentialsProvider('default', sections)

        try {
            await sut.getCredentials()
            assert.fail('expected exception')
        } catch (err) {}
    })

    describe('sso-session', function () {
        const creds = {
            accessKeyId: 'x',
            secretAccessKey: 'y',
            expiration: undefined,
        }

        const defaultProfile = `
        [profile default]
        sso_session = default
        sso_account_id = 012345678910
        sso_role_name = MyRole
        `

        const defaultSession = `
        [sso-session default]
        sso_region = us-east-1
        sso_start_url = https://d-xxxxxxxxx.awsapps.com/start
        sso_registration_scopes = sso:account:access
        `

        beforeEach(function () {
            const client = stub(SsoClient, { region: 'foo' })
            client.getRoleCredentials.callsFake(async request => {
                assert.strictEqual(request.accountId, '012345678910')
                assert.strictEqual(request.roleName, 'MyRole')

                return creds
            })
            sandbox.stub(SsoClient, 'create').returns(client)
            sandbox.stub(SsoAccessTokenProvider.prototype, 'getToken').resolves()
            sandbox.stub(SsoAccessTokenProvider.prototype, 'createToken').resolves()
        })

        it('supports "sso-session" with "profile"', async function () {
            const sections = await createTestSections(`${defaultProfile}\n${defaultSession}`)
            const sut = new SharedCredentialsProvider('default', sections)
            assert.deepStrictEqual(await sut.getCredentials(), creds)
        })

        it('rejects if the session is missing', async function () {
            const sections = await createTestSections(`${defaultProfile}`)
            const sut = new SharedCredentialsProvider('default', sections)
            await assert.rejects(() => sut.getCredentials())
        })

        it('rejects if the account is missing', async function () {
            const badProfile = `
            [profile default]
            sso_session = default
            sso_role_name = MyRole
            `

            const sections = await createTestSections(`${badProfile}\n${defaultSession}`)
            const sut = new SharedCredentialsProvider('default', sections)
            await assert.rejects(() => sut.getCredentials())
        })

        it('rejects if the role is missing', async function () {
            const badProfile = `
            [profile default]
            sso_session = default
            sso_account_id = 012345678910
            `

            const sections = await createTestSections(`${badProfile}\n${defaultSession}`)
            const sut = new SharedCredentialsProvider('default', sections)
            await assert.rejects(() => sut.getCredentials())
        })

        it('rejects if the scopes do not contain "sso:account:access"', async function () {
            const badSession = `
            [sso-session default]
            sso_region = us-east-1
            sso_start_url = https://d-xxxxxxxxx.awsapps.com/start
            sso_registration_scopes = foo
            `

            const sections = await createTestSections(`${defaultProfile}\n${badSession}`)
            const sut = new SharedCredentialsProvider('default', sections)
            await assert.rejects(() => sut.getCredentials())
        })

        it('does not reject extra scopes if present', async function () {
            const goodSession = `
            [sso-session default]
            sso_region = us-east-1
            sso_start_url = https://d-xxxxxxxxx.awsapps.com/start
            sso_registration_scopes = sso:account:access, foo
            `

            const sections = await createTestSections(`${defaultProfile}\n${goodSession}`)
            const sut = new SharedCredentialsProvider('default', sections)
            assert.deepStrictEqual(await sut.getCredentials(), creds)
        })
    })

    describe('patchSourceCredentials', async function () {
        let childProfile: { [key: string]: string } = {}
        let resolvedBaseProfile: { [key: string]: string } = {}

        const iniFile = (base: string) => `
        [profile base]
        ${base}

        [profile child]
        source_profile = base
        role_arn = testarn
        `

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
                stripUndefined(profile as any)
                assert.deepStrictEqual(profile, resolvedProfile)
                return () => Promise.resolve({})
            })

            await sut.getCredentials()
            assert.ok(makeIni.calledOnce)
        }

        it('resolves profile with source_profile as credential_process', async function () {
            this.skip()

            const sections = await createTestSections(iniFile('credential_process = test_process'))
            const sut = new SharedCredentialsProvider('child', sections)

            sandbox.stub(process, 'fromProcess').returns(() =>
                Promise.resolve({
                    accessKeyId: resolvedBaseProfile['aws_access_key_id'],
                    secretAccessKey: resolvedBaseProfile['aws_secret_access_key'],
                })
            )

            await assertIniProviderResolves(sut, {
                base: resolvedBaseProfile,
                child: childProfile,
            })
        })

        it('resolves profile with source_profile and MFA', async function () {
            this.skip()

            const mfaSerial = 'serial'
            const sections = await createTestSections(
                iniFile(`
            credential_process = test_process
            mfa_serial = ${mfaSerial}
            `)
            )
            const sut = new SharedCredentialsProvider('child', sections)

            // We use 'credential_process' here to simulate static credentials since we can't
            // stub out 'makeSharedIniFileCredentialsProvider' as it is already stubbed
            sandbox.stub(process, 'fromProcess').returns(() =>
                Promise.resolve({
                    accessKeyId: resolvedBaseProfile['aws_access_key_id'],
                    secretAccessKey: resolvedBaseProfile['aws_secret_access_key'],
                })
            )

            await assertIniProviderResolves(sut, {
                base: resolvedBaseProfile,
                child: {
                    ...childProfile,
                    mfa_serial: mfaSerial,
                },
            })
        })
    })
})

function assertSubstringsInText(text: string | undefined, ...substrings: string[]) {
    assert.ok(text)
    substrings.forEach(substring => assert.notStrictEqual(text!.indexOf(substring), -1))
}
