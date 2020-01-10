/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SharedCredentialsProvider } from '../../../credentials/providers/sharedCredentialsProvider'
import { Profile } from '../../../shared/credentials/credentialsFile'
import { assertThrowsError } from '../../shared/utilities/assertUtils'

const MISSING_PROPERTIES_FRAGMENT = 'missing properties'

describe('SharedCredentialsProvider', async () => {
    it('constructor errs if profile does not exist', async () => {
        await assertThrowsError(async () => {
            // @ts-ignore - sut is unused, we expect the constructor to throw
            const sut = new SharedCredentialsProvider(
                'some-other-profile',
                new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }]])
            )
        })
    })

    it('produces a CredentialsProviderId', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }]])
        )

        assert.deepStrictEqual(sut.getCredentialsProviderId(), {
            credentialType: 'profile',
            credentialTypeId: 'default'
        })
    })

    it('retrieves the default region from the profile', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([
                ['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y', region: 'foo' }]
            ])
        )

        assert.strictEqual(sut.getDefaultRegion(), 'foo')
    })

    it('returns undefined if the region does not have a default region', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }]])
        )

        assert.strictEqual(sut.getDefaultRegion(), undefined)
    })

    it('validation identifies a source_profile reference that does not exist', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { role_arn: 'x', source_profile: 'fakeprofile' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'not found')
    })

    it('validation identifies a source_profile reference cycle', async () => {
        const sut = new SharedCredentialsProvider(
            'profileA',
            new Map<string, Profile>([
                ['profileA', { role_arn: 'x', source_profile: 'profileB' }],
                ['profileB', { role_arn: 'x', source_profile: 'profileC' }],
                ['profileC', { role_arn: 'x', source_profile: 'profileA' }]
            ])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'Cycle detected', 'profileA', 'profileB', 'profileC')
    })

    it('validation identifies when access key id is missing a corresponding secret key', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), MISSING_PROPERTIES_FRAGMENT, 'aws_secret_access_key')
    })

    it('validation identifies when session_token is missing a corresponding access key id', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_secret_access_key: 'y', aws_session_token: 'z' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), MISSING_PROPERTIES_FRAGMENT, 'aws_access_key_id')
    })

    it('validation identifies when session_token is missing a corresponding secret key', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_session_token: 'z' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), MISSING_PROPERTIES_FRAGMENT, 'aws_secret_access_key')
    })

    it('validation identifies when the profile contains no supported properties', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { hello: 'world' }]])
        )

        assert.notStrictEqual(sut.validate(), undefined)
        assertSubstringsInText(sut.validate(), 'not supported')
    })

    it('validates a valid profile with an access key', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }]])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with a session token', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([
                ['default', { aws_access_key_id: 'x', aws_secret_access_key: 'y', aws_session_token: 'z' }]
            ])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with credential_process', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { credential_process: 'x' }]])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with role_arn', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { role_arn: 'x' }]])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('validates a valid profile with role_arn and source_profile', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([
                ['default', { role_arn: 'x', source_profile: 'B' }],
                ['B', { aws_access_key_id: 'x', aws_secret_access_key: 'y' }]
            ])
        )

        assert.strictEqual(sut.validate(), undefined)
    })

    it('getCredentials throws when the profile is not valid', async () => {
        const sut = new SharedCredentialsProvider(
            'default',
            new Map<string, Profile>([['default', { aws_access_key_id: 'x' }]])
        )

        await assertThrowsError(async () => {
            await sut.getCredentials()
        })
    })
})

function assertSubstringsInText(text: string | undefined, ...substrings: string[]) {
    assert.ok(text)
    substrings.forEach(substring => assert.notStrictEqual(text!.indexOf(substring), -1))
}
