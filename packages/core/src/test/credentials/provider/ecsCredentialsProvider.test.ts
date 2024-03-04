/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Credentials } from 'aws-sdk'
import { EcsCredentialsProvider } from '../../../auth/providers/ecsCredentialsProvider'
import { EnvironmentVariables } from '../../../shared/environmentVariables'

describe('EcsCredentialsProvider', function () {
    const dummyUri = 'dummyUri'
    const dummyRegion = 'dummmyRegion'
    const dummyCredentials = { accessKeyId: 'dummyKey' } as Credentials
    const dummyProvider = () => {
        return Promise.resolve(dummyCredentials)
    }
    const env = process.env as EnvironmentVariables

    let credentialsProvider: EcsCredentialsProvider

    beforeEach(function () {
        credentialsProvider = new EcsCredentialsProvider(dummyProvider)
    })

    afterEach(function () {
        delete env.AWS_CONTAINER_CREDENTIALS_FULL_URI
        delete env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
        delete env.AWS_DEFAULT_REGION
    })

    it('should be available if container full URI present', async function () {
        env.AWS_CONTAINER_CREDENTIALS_FULL_URI = dummyUri

        assert.strictEqual(await credentialsProvider.isAvailable(), true)
    })

    it('should be available if container relative URI present', async function () {
        env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI = dummyUri

        assert.strictEqual(await credentialsProvider.isAvailable(), true)
    })

    it('should be unavailable if container URIs not present', async function () {
        assert.strictEqual(await credentialsProvider.isAvailable(), false)
    })

    it('should be unavailable if credential provider throws exception', async function () {
        const dummyProvider = () => {
            throw new Error('')
        }
        credentialsProvider = new EcsCredentialsProvider(dummyProvider)
        assert.strictEqual(await credentialsProvider.isAvailable(), false)
    })

    it('should retrieve provided region', function () {
        env.AWS_DEFAULT_REGION = dummyRegion

        assert.strictEqual(credentialsProvider.getDefaultRegion(), dummyRegion)
    })

    it('should resolve credentials', async function () {
        env.AWS_DEFAULT_REGION = dummyRegion

        assert.strictEqual(await credentialsProvider.getCredentials(), dummyCredentials)
    })

    it('should return undefined region when not provided', function () {
        assert.strictEqual(credentialsProvider.getDefaultRegion(), undefined)
    })
})
