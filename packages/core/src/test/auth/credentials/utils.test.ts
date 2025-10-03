/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Credentials } from '@aws-sdk/types'
import { asEnvironmentVariables } from '../../../auth/credentials/utils'

describe('asEnvironmentVariables', function () {
    const testCredentials: Credentials = {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: 'test-session-token',
    }

    it('converts credentials to environment variables', function () {
        const envVars = asEnvironmentVariables(testCredentials)

        assert.strictEqual(envVars.AWS_ACCESS_KEY, testCredentials.accessKeyId)
        assert.strictEqual(envVars.AWS_ACCESS_KEY_ID, testCredentials.accessKeyId)
        assert.strictEqual(envVars.AWS_SECRET_ACCESS_KEY, testCredentials.secretAccessKey)
        assert.strictEqual(envVars.AWS_SESSION_TOKEN, testCredentials.sessionToken)
        assert.strictEqual(envVars.AWS_SECURITY_TOKEN, testCredentials.sessionToken)
    })

    it('includes endpoint URL when provided', function () {
        const testEndpointUrl = 'https://custom-endpoint.example.com'
        const envVars = asEnvironmentVariables(testCredentials, testEndpointUrl)

        assert.strictEqual(envVars.AWS_ACCESS_KEY, testCredentials.accessKeyId)
        assert.strictEqual(envVars.AWS_ACCESS_KEY_ID, testCredentials.accessKeyId)
        assert.strictEqual(envVars.AWS_SECRET_ACCESS_KEY, testCredentials.secretAccessKey)
        assert.strictEqual(envVars.AWS_SESSION_TOKEN, testCredentials.sessionToken)
        assert.strictEqual(envVars.AWS_SECURITY_TOKEN, testCredentials.sessionToken)
        assert.strictEqual(envVars.AWS_ENDPOINT_URL, testEndpointUrl)
    })

    it('does not include endpoint URL when not provided', function () {
        const envVars = asEnvironmentVariables(testCredentials)

        assert.strictEqual(envVars.AWS_ACCESS_KEY, testCredentials.accessKeyId)
        assert.strictEqual(envVars.AWS_ACCESS_KEY_ID, testCredentials.accessKeyId)
        assert.strictEqual(envVars.AWS_SECRET_ACCESS_KEY, testCredentials.secretAccessKey)
        assert.strictEqual(envVars.AWS_SESSION_TOKEN, testCredentials.sessionToken)
        assert.strictEqual(envVars.AWS_SECURITY_TOKEN, testCredentials.sessionToken)
        assert.strictEqual(envVars.AWS_ENDPOINT_URL, undefined)
    })

    it('handles credentials without session token', function () {
        const credsWithoutToken: Credentials = {
            accessKeyId: 'test-access-key',
            secretAccessKey: 'test-secret-key',
        }
        const testEndpointUrl = 'https://custom-endpoint.example.com'
        const envVars = asEnvironmentVariables(credsWithoutToken, testEndpointUrl)

        assert.strictEqual(envVars.AWS_ACCESS_KEY, credsWithoutToken.accessKeyId)
        assert.strictEqual(envVars.AWS_ACCESS_KEY_ID, credsWithoutToken.accessKeyId)
        assert.strictEqual(envVars.AWS_SECRET_ACCESS_KEY, credsWithoutToken.secretAccessKey)
        assert.strictEqual(envVars.AWS_SESSION_TOKEN, undefined)
        assert.strictEqual(envVars.AWS_SECURITY_TOKEN, undefined)
        assert.strictEqual(envVars.AWS_ENDPOINT_URL, testEndpointUrl)
    })
})
