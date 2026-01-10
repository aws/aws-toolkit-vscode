/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SharedCredentialsProvider } from '../../../auth/providers/sharedCredentialsProvider'
import { createTestSections } from '../../credentials/testUtil'
import { DefaultStsClient } from '../../../shared/clients/stsClient'
import { oneDay } from '../../../shared/datetime'
import sinon from 'sinon'
import { SsoAccessTokenProvider } from '../../../auth/sso/ssoAccessTokenProvider'
import { SsoClient } from '../../../auth/sso/clients'

describe('SharedCredentialsProvider - Role Chaining with SSO', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should handle role chaining from SSO profile', async function () {
        // Mock the SSO authentication
        sandbox.stub(SsoAccessTokenProvider.prototype, 'getToken').resolves({
            accessToken: 'test-token',
            expiresAt: new Date(Date.now() + oneDay),
        })

        // Mock SSO getRoleCredentials
        sandbox.stub(SsoClient.prototype, 'getRoleCredentials').resolves({
            accessKeyId: 'sso-access-key',
            secretAccessKey: 'sso-secret-key',
            sessionToken: 'sso-session-token',
            expiration: new Date(Date.now() + oneDay),
        })

        // Mock STS assumeRole
        sandbox.stub(DefaultStsClient.prototype, 'assumeRole').callsFake(async (request) => {
            assert.strictEqual(request.RoleArn, 'arn:aws:iam::123456789012:role/dev')
            return {
                Credentials: {
                    AccessKeyId: 'assumed-access-key',
                    SecretAccessKey: 'assumed-secret-key',
                    SessionToken: 'assumed-session-token',
                    Expiration: new Date(Date.now() + oneDay),
                },
            }
        })

        const sections = await createTestSections(`
            [sso-session aws1_session]
            sso_start_url = https://example.awsapps.com/start
            sso_region = us-east-1
            sso_registration_scopes = sso:account:access

            [profile Landing]
            sso_session = aws1_session
            sso_account_id = 111111111111
            sso_role_name = Landing
            region = us-east-1

            [profile dev]
            region = us-east-1
            role_arn = arn:aws:iam::123456789012:role/dev
            source_profile = Landing
        `)

        const provider = new SharedCredentialsProvider('dev', sections)
        const credentials = await provider.getCredentials()

        assert.strictEqual(credentials.accessKeyId, 'assumed-access-key')
        assert.strictEqual(credentials.secretAccessKey, 'assumed-secret-key')
        assert.strictEqual(credentials.sessionToken, 'assumed-session-token')
    })
})

describe('SharedCredentialsProvider - Endpoint URL', function () {
    it('returns endpoint URL when present in profile', async function () {
        const ini = `
            [profile test-profile]
            aws_access_key_id = test-key
            aws_secret_access_key = test-secret
            endpoint_url = https://custom-endpoint.example.com
            region = us-west-2
            `
        const sections = await createTestSections(ini)
        const provider = new SharedCredentialsProvider('test-profile', sections)

        assert.strictEqual(provider.getEndpointUrl(), 'https://custom-endpoint.example.com')
    })

    it('returns undefined when endpoint URL is not present in profile', async function () {
        const ini = `
            [profile test-profile]
            aws_access_key_id = test-key
            aws_secret_access_key = test-secret
            region = us-west-2
            `
        const sections = await createTestSections(ini)
        const provider = new SharedCredentialsProvider('test-profile', sections)

        assert.strictEqual(provider.getEndpointUrl(), undefined)
    })

    it('returns endpoint URL for SSO profile', async function () {
        const ini = `
            [sso-session sso-valerena]
            sso_start_url = https://example.awsapps.com/start
            sso_region = us-east-1
            sso_registration_scopes = sso:account:access
            [profile sso-profile]
            sso_account_id = 123456789012
            sso_role_name = TestRole
            region = us-west-2
            endpoint_url = https://sso-endpoint.example.com
            `
        const sections = await createTestSections(ini)
        const provider = new SharedCredentialsProvider('sso-profile', sections)

        assert.strictEqual(provider.getEndpointUrl(), 'https://sso-endpoint.example.com')
    })

    it('returns endpoint URL for role assumption profile', async function () {
        const ini = `
            [profile source-profile]
            aws_access_key_id = source-key
            aws_secret_access_key = source-secret

            [profile role-profile]
            role_arn = arn:aws:iam::123456789012:role/TestRole
            source_profile = source-profile
            region = us-west-2
            endpoint_url = https://role-endpoint.example.com
            `
        const sections = await createTestSections(ini)
        const provider = new SharedCredentialsProvider('role-profile', sections)

        assert.strictEqual(provider.getEndpointUrl(), 'https://role-endpoint.example.com')
    })

    it('returns endpoint URL for credential process profile', async function () {
        const ini = `
            [profile process-profile]
            credential_process = /usr/local/bin/credential-process
            region = us-west-2
            endpoint_url = https://process-endpoint.example.com
            `
        const sections = await createTestSections(ini)
        const provider = new SharedCredentialsProvider('process-profile', sections)

        assert.strictEqual(provider.getEndpointUrl(), 'https://process-endpoint.example.com')
    })

    it('handles empty endpoint URL string', async function () {
        const ini = `
            [profile test-profile]
            aws_access_key_id = test-key
            aws_secret_access_key = test-secret
            region = us-west-2
            endpoint_url =
            `
        const sections = await createTestSections(ini)
        const provider = new SharedCredentialsProvider('test-profile', sections)

        assert.strictEqual(provider.getEndpointUrl(), undefined)
    })

    it('endpoint URL does not affect profile validation', async function () {
        const ini = `
            [profile valid-profile]
            aws_access_key_id = test-key
            aws_secret_access_key = test-secret
            region = us-west-2
            endpoint_url = https://custom-endpoint.example.com
            `
        const sections = await createTestSections(ini)
        const provider = new SharedCredentialsProvider('valid-profile', sections)

        assert.strictEqual(provider.validate(), undefined)
        assert.strictEqual(await provider.isAvailable(), true)
    })
})

describe('SharedCredentialsProvider - Console Session', function () {
    it('recognizes console session profile type and validates console session profile as valid', async function () {
        const ini = `
            [profile console-session-profile]
            login_session = arn:aws:iam::0123456789012:user/username
            region = us-west-2
        `
        const sections = await createTestSections(ini)
        const provider = new SharedCredentialsProvider('console-session-profile', sections)

        assert.strictEqual(provider.validate(), undefined)
        assert.strictEqual(await provider.isAvailable(), true)
        assert.strictEqual(provider.getProviderType(), 'profile')
        assert.strictEqual(provider.getTelemetryType(), 'consoleSessionProfile')
    })

    it('fails for profile without required properties', async function () {
        const ini = `
            [profile invalid-console-profile]
            region = us-west-2
        `
        const sections = await createTestSections(ini)
        const provider = new SharedCredentialsProvider('invalid-console-profile', sections)

        assert.notStrictEqual(provider.validate(), undefined)
        assert.strictEqual(await provider.isAvailable(), false)
    })
})
