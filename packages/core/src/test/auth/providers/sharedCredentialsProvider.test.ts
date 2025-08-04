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
