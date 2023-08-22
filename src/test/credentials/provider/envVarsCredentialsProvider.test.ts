/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { EnvVarsCredentialsProvider } from '../../../auth/providers/envVarsCredentialsProvider'
import { EnvironmentVariables } from '../../../shared/environmentVariables'

describe('EnvVarsCredentialsProvider', function () {
    const dummyAccessKey = 'dummyAccessKey'
    const dummySecretKey = 'dummySecret'
    const dummySessionToken = 'dummySession'
    const dummyRegion = 'dummmyRegion'

    const credentialsProvider = new EnvVarsCredentialsProvider()
    const env = process.env as EnvironmentVariables

    afterEach(function () {
        delete env.AWS_ACCESS_KEY_ID
        delete env.AWS_SECRET_ACCESS_KEY
        delete env.AWS_REGION
    })

    it('should be valid if access and secret key are provided', async function () {
        env.AWS_ACCESS_KEY_ID = dummyAccessKey
        env.AWS_SECRET_ACCESS_KEY = dummySecretKey

        assert.strictEqual(await credentialsProvider.isAvailable(), true)
    })

    it('should be invalid if access key not provided', async function () {
        env.AWS_SECRET_ACCESS_KEY = dummySecretKey

        assert.strictEqual(await credentialsProvider.isAvailable(), false)
    })

    it('should be invalid if secret key not provided', async function () {
        env.AWS_ACCESS_KEY_ID = dummyAccessKey

        assert.strictEqual(await credentialsProvider.isAvailable(), false)
    })

    it('should retrieve provided region', function () {
        env.AWS_REGION = dummyRegion

        assert.strictEqual(credentialsProvider.getDefaultRegion(), dummyRegion)
    })

    it('should return undefined region when not provided', function () {
        assert.strictEqual(credentialsProvider.getDefaultRegion(), undefined)
    })

    it('returns valid credentials', async function () {
        env.AWS_ACCESS_KEY_ID = dummyAccessKey
        env.AWS_SECRET_ACCESS_KEY = dummySecretKey
        env.AWS_SESSION_TOKEN = dummySessionToken

        const credentials = await credentialsProvider.getCredentials()

        assert.strictEqual(credentials.accessKeyId, dummyAccessKey)
        assert.strictEqual(credentials.secretAccessKey, dummySecretKey)
        assert.strictEqual(credentials.sessionToken, dummySessionToken)
    })
})
