/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { fromIni } from '@aws-sdk/credential-providers'
import { LocalCredentialProfile } from '../types'
import { readMapping } from './utils'

/**
 * Resolves AWS credentials for a given SageMaker space connection identifier
 * using the 'lc' (local connection) credential mapping.
 *
 * Supported profile types:
 * - 'iam': Looks up credentials from AWS config using profile name.
 * - 'sso': Uses accessKey, secret, and sessionToken from the mapping file.
 *
 * @param connectionIdentifier - The ARN or space ID used to locate the profile in the mapping.
 * @returns A Promise that resolves to AWS credentials compatible with AWS SDK v3.
 * @throws If the profile is missing, malformed, or unsupported.
 */
export async function resolveCredentialsFor(connectionIdentifier: string): Promise<any> {
    const mapping = await readMapping()
    const profile = mapping.localCredential?.[connectionIdentifier] as LocalCredentialProfile

    if (!profile) {
        throw new Error(`No profile found for "${connectionIdentifier}"`)
    }

    switch (profile.type) {
        case 'iam': {
            const name = profile.profileName?.split(':')[1]
            if (!name) {
                throw new Error(`Invalid IAM profile name for "${connectionIdentifier}"`)
            }
            return fromIni({ profile: name })
        }
        case 'sso': {
            const { accessKey, secret, token } = profile
            if (!accessKey || !secret || !token) {
                throw new Error(`Missing SSO credentials for "${connectionIdentifier}"`)
            }
            return {
                accessKeyId: accessKey,
                secretAccessKey: secret,
                sessionToken: token,
            }
        }
        default:
            throw new Error(`Unsupported profile type "${profile}"`)
    }
}
