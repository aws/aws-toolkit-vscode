/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AWSError, EC2MetadataCredentials, MetadataService } from 'aws-sdk'
import { anyFunction, anyString } from 'ts-mockito'
import { Ec2CredentialsProvider } from '../../../credentials/providers/ec2CredentialsProvider'
import { instance, mock, when } from '../../utilities/mockito'

describe('Ec2CredentialsProvider', () => {
    const dummyRegion = 'dummmyRegion'

    const mockResponse = JSON.stringify({
        region: dummyRegion
    })

    let mockMetadata: MetadataService
    let credentialsProvider: Ec2CredentialsProvider

    beforeEach(function () {
        mockMetadata = mock()
        credentialsProvider = new Ec2CredentialsProvider(instance(mockMetadata))
    })

    afterEach(() => {
    })

    it('should be valid if EC2 metadata service resolves', async() => {
        mockClient({
            response: mockResponse
        })
        assert.strictEqual(await credentialsProvider.isAvailable(), true)
    })

    it('should be invalid if EC2 metadata service fails to resolve', async() => {
        mockClient({
            fail: true
        })
        assert.strictEqual(await credentialsProvider.isAvailable(), false)
    })

    it('should throw exception for valid check when uninitialized', async() => {
        mockClient({
            response: mockResponse
        })
        try {
            credentialsProvider.isAvailable()
            assert.fail('expected exception')
        } catch (err) {}
    })

    it('should return EC2 retrieved region', async() => {
        mockClient({
            response: mockResponse
        })

        await credentialsProvider.isAvailable()
        assert.strictEqual(credentialsProvider.getDefaultRegion(), dummyRegion)
    })

    it('should return undefined region when not available', async() => {
        mockClient({
            response: JSON.stringify({})
        })

        await credentialsProvider.isAvailable()
        assert.strictEqual(credentialsProvider.getDefaultRegion(), undefined)
    })

    it('returns credentials', async() => {
        const credentials = await credentialsProvider.getCredentials()
        assert(credentials instanceof EC2MetadataCredentials)
    })

    function mockClient(opts: {
        fail?: boolean,
        response?: string
    }): void {
        when(mockMetadata.request(
            anyString(),
            anyFunction()
        )).thenCall((
            path: string,
            callback: (err?: AWSError, data?: string) => void) => {
                callback(opts.fail ? {} as AWSError : undefined, opts.response)
        })
    }

})
