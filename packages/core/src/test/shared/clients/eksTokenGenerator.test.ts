/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { generateEksToken } from '../../../shared/clients/eksTokenGenerator'
import { AwsCredentialIdentity } from '@aws-sdk/types'

describe('generateEksToken', function () {
    const testCredentials: AwsCredentialIdentity = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    }

    it('returns a token with the k8s-aws-v1 prefix', async function () {
        const { token } = await generateEksToken('my-cluster', 'us-east-1', testCredentials)
        assert.ok(
            token.startsWith('k8s-aws-v1.'),
            `Token should start with k8s-aws-v1. but got: ${token.substring(0, 20)}`
        )
    })

    it('returns a base64url-encoded presigned URL after the prefix', async function () {
        const { token } = await generateEksToken('my-cluster', 'us-east-1', testCredentials)
        const encoded = token.replace('k8s-aws-v1.', '')
        const decoded = Buffer.from(encoded, 'base64url').toString('utf-8')
        assert.ok(
            decoded.startsWith('https://'),
            `Decoded token should be an https URL but got: ${decoded.substring(0, 30)}`
        )
    })

    it('presigned URL targets regional STS endpoint', async function () {
        const { token } = await generateEksToken('my-cluster', 'us-west-2', testCredentials)
        const decoded = Buffer.from(token.replace('k8s-aws-v1.', ''), 'base64url').toString('utf-8')
        assert.ok(decoded.includes('sts.us-west-2.amazonaws.com'), 'URL should target regional STS endpoint')
    })

    it('presigned URL contains GetCallerIdentity action', async function () {
        const { token } = await generateEksToken('my-cluster', 'us-east-1', testCredentials)
        const decoded = Buffer.from(token.replace('k8s-aws-v1.', ''), 'base64url').toString('utf-8')
        assert.ok(decoded.includes('Action=GetCallerIdentity'), 'URL should contain GetCallerIdentity action')
    })

    it('presigned URL includes x-k8s-aws-id in signed headers', async function () {
        const { token } = await generateEksToken('test-cluster-123', 'us-east-1', testCredentials)
        const decoded = Buffer.from(token.replace('k8s-aws-v1.', ''), 'base64url').toString('utf-8')
        assert.ok(
            decoded.includes('X-Amz-SignedHeaders') && decoded.includes('x-k8s-aws-id'),
            'URL should include x-k8s-aws-id in signed headers'
        )
    })

    it('returns expiresAt in the future', async function () {
        const before = Date.now()
        const { expiresAt } = await generateEksToken('my-cluster', 'us-east-1', testCredentials)
        assert.ok(expiresAt.getTime() > before, 'expiresAt should be in the future')
        assert.ok(expiresAt.getTime() <= before + 900_000 + 1000, 'expiresAt should be within ~15 minutes')
    })

    it('generates different tokens for different clusters', async function () {
        const { token: token1 } = await generateEksToken('cluster-a', 'us-east-1', testCredentials)
        const { token: token2 } = await generateEksToken('cluster-b', 'us-east-1', testCredentials)
        assert.notStrictEqual(token1, token2, 'Tokens for different clusters should differ')
    })

    it('generates different tokens for different regions', async function () {
        const { token: token1 } = await generateEksToken('my-cluster', 'us-east-1', testCredentials)
        const { token: token2 } = await generateEksToken('my-cluster', 'eu-west-1', testCredentials)
        assert.notStrictEqual(token1, token2, 'Tokens for different regions should differ')
    })

    it('works with a credentials provider function', async function () {
        const provider = async () => testCredentials
        const { token } = await generateEksToken('my-cluster', 'us-east-1', provider)
        assert.ok(token.startsWith('k8s-aws-v1.'))
    })
})
