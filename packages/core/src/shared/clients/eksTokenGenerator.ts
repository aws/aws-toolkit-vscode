/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignatureV4 } from '@smithy/signature-v4'
import { HttpRequest } from '@smithy/protocol-http'
import { Sha256 } from '@aws-crypto/sha256-js'
import { AwsCredentialIdentity, Provider } from '@aws-sdk/types'

const tokenPrefix = 'k8s-aws-v1.'
const tokenLifetimeSeconds = 900

/**
 * Generates an EKS bearer token by presigning an STS GetCallerIdentity request.
 * This is the SDK equivalent of `aws eks get-token`.
 *
 * @see https://docs.aws.amazon.com/eks/latest/userguide/cluster-auth.html
 */
export async function generateEksToken(
    clusterName: string,
    region: string,
    credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
): Promise<{ token: string; expiresAt: Date }> {
    const signer = new SignatureV4({
        credentials,
        region,
        service: 'sts',
        sha256: Sha256,
    })

    const request = new HttpRequest({
        method: 'GET',
        protocol: 'https:',
        hostname: `sts.${region}.amazonaws.com`,
        path: '/',
        headers: {
            host: `sts.${region}.amazonaws.com`,
            'x-k8s-aws-id': clusterName,
        },
        query: {
            Action: 'GetCallerIdentity',
            Version: '2011-06-15',
        },
    })

    const presigned = await signer.presign(request, { expiresIn: tokenLifetimeSeconds })

    const serializedUrl =
        `${presigned.protocol}//${presigned.hostname}${presigned.path}?` +
        Object.entries(presigned.query ?? {})
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
            .join('&')

    return {
        token: tokenPrefix + Buffer.from(serializedUrl).toString('base64url'),
        expiresAt: new Date(Date.now() + tokenLifetimeSeconds * 1000),
    }
}
