/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ECSCredentials } from 'aws-sdk'
import { EcsCredentialsProvider } from '../../../credentials/providers/ecsCredentialsProvider'
import { EnvironmentVariables } from '../../../shared/environmentVariables'

describe('EcsCredentialsProvider', function () {
    const dummyUri = 'dummyUri'
    const dummyRegion = 'dummmyRegion'

    const credentialsProvider = new EcsCredentialsProvider()
    const env = process.env as EnvironmentVariables

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

    it('should retrieve provided region', function () {
        env.AWS_DEFAULT_REGION = dummyRegion

        assert.strictEqual(credentialsProvider.getDefaultRegion(), dummyRegion)
    })

    it('should return undefined region when not provided', function () {
        assert.strictEqual(credentialsProvider.getDefaultRegion(), undefined)
    })

    it('returns credentials', async function () {
        env.AWS_CONTAINER_CREDENTIALS_FULL_URI = dummyUri

        const credentials = await credentialsProvider.getCredentials()

        assert(credentials instanceof ECSCredentials)
    })
})
