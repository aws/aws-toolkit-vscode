/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { EC2MetadataCredentials } from 'aws-sdk'
import { Ec2MetadataClient, InstanceIdentity } from '../../../shared/clients/ec2MetadataClient'
import { Ec2CredentialsProvider } from '../../../credentials/providers/ec2CredentialsProvider'
import { instance, mock, when } from '../../utilities/mockito'

describe('Ec2CredentialsProvider', function () {
    const dummyRegion = 'dummmyRegion'

    const mockResponse = {
        region: dummyRegion,
    } as InstanceIdentity

    let mockMetadata: Ec2MetadataClient
    let credentialsProvider: Ec2CredentialsProvider

    beforeEach(function () {
        mockMetadata = mock()
        credentialsProvider = new Ec2CredentialsProvider(instance(mockMetadata))
    })

    it('should be valid if EC2 metadata service resolves', async function () {
        mockClient({
            response: mockResponse,
        })
        assert.strictEqual(await credentialsProvider.isAvailable(), true)
    })

    it('should be invalid if EC2 metadata service fails to resolve', async function () {
        mockClient({
            fail: true,
        })
        assert.strictEqual(await credentialsProvider.isAvailable(), false)
    })

    it('should throw exception for valid check when uninitialized', async function () {
        mockClient({
            response: mockResponse,
        })
        try {
            credentialsProvider.isAvailable()
            assert.fail('expected exception')
        } catch (err) {}
    })

    it('should return EC2 retrieved region', async function () {
        mockClient({
            response: mockResponse,
        })

        await credentialsProvider.isAvailable()
        assert.strictEqual(credentialsProvider.getDefaultRegion(), dummyRegion)
    })

    it('should return undefined region when not available', async function () {
        mockClient({
            response: {} as InstanceIdentity,
        })

        await credentialsProvider.isAvailable()
        assert.strictEqual(credentialsProvider.getDefaultRegion(), undefined)
    })

    it('returns credentials', async function () {
        const credentials = await credentialsProvider.getCredentials()
        assert(credentials instanceof EC2MetadataCredentials)
    })

    function mockClient(opts: { fail?: boolean; response?: InstanceIdentity }) {
        if (opts.fail) {
            when(mockMetadata.getInstanceIdentity()).thenReject(new Error('foo'))
        } else if (opts.response) {
            when(mockMetadata.getInstanceIdentity()).thenResolve(opts.response)
        }
    }
})
