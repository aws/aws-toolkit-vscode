/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { credentialsProviderType, CredentialsProviderType } from './credentialsProvider'

const CREDENTIALS_PROVIDER_ID_SEPARATOR = ':'

/**
 * "Fully-qualified" credentials structure (source + name).
 */
export interface CredentialsProviderId {
    /** Credentials source id, e.g. "sharedCredentials". */
    readonly credentialSource: CredentialsProviderType
    /** User-defined profile name, e.g. "default". */
    readonly credentialTypeId: string
}

/**
 * Gets the string form of the given `CredentialsProvider`.
 *
 * For use in e.g. the statusbar, menus, etc.  Includes:
 * - credentials source kind
 * - instance-identifying information (typically the "profile name")
 *
 * @param credentialsProviderId  Value to be formatted.
 */
export function asString(credentialsProviderId: CredentialsProviderId): string {
    return [credentialsProviderId.credentialSource, credentialsProviderId.credentialTypeId].join(
        CREDENTIALS_PROVIDER_ID_SEPARATOR
    )
}

export function fromString(credentialsProviderId: string): CredentialsProviderId {
    const separatorPos = credentialsProviderId.indexOf(CREDENTIALS_PROVIDER_ID_SEPARATOR)

    if (separatorPos === -1) {
        throw new Error(`Unexpected credentialsProviderId format: ${credentialsProviderId}`)
    }

    const credSource = credentialsProviderId.substring(0, separatorPos)
    if (!credentialsProviderType.includes(credSource as any)) {
        throw new Error(`unexpected credential source: ${credSource}`)
    }

    return {
        credentialSource: credSource as CredentialsProviderType,
        credentialTypeId: credentialsProviderId.substring(separatorPos + 1),
    }
}

export function isEqual(idA: CredentialsProviderId, idB: CredentialsProviderId): boolean {
    return idA.credentialSource === idB.credentialSource && idA.credentialTypeId === idB.credentialTypeId
}
