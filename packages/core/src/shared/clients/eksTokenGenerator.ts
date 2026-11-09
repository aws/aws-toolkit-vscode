/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SignatureV4 } from '@smithy/signature-v4'
import { HttpRequest } from '@smithy/protocol-http'
import { Sha256 } from '@aws-crypto/sha256-js'
import { AwsCredentialIdentity, Provider } from '@aws-sdk/types'

const tokenPrefix = 'k8s-aws-v1.'

/** Maximum token lifetime (seconds). 15 minutes is the upper bound enforced by the EKS token authenticator. */
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

    const presigned = await signer.presign(request, { expiresIn: tokenLifetimeSeconds }).catch((err) => {
        throw new Error(
            `Failed to generate EKS token for cluster "${clusterName}" in ${region}: ${err instanceof Error ? err.message : String(err)}`
        )
    })

    const url = new URL(`${presigned.protocol}//${presigned.hostname}${presigned.path}`)
    for (const [k, v] of Object.entries(presigned.query ?? {})) {
        if (Array.isArray(v)) {
            for (const item of v) {
                url.searchParams.append(k, item)
            }
        } else {
            url.searchParams.set(k, String(v))
        }
    }

    return {
        token: tokenPrefix + Buffer.from(url.toString()).toString('base64url'),
        // expiresAt is a client-side approximation. Clock skew between the local machine and STS
        // may cause minor drift; the 60s refresh buffer in KubectlClient compensates for this.
        expiresAt: new Date(Date.now() + tokenLifetimeSeconds * 1000),
    }
}
