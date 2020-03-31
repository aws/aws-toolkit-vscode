/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const CREDENTIALS_PROVIDER_ID_SEPARATOR = ':'

export interface CredentialsProviderId {
    readonly credentialType: string
    readonly credentialTypeId: string
}

/**
 * Gets a user-friendly string represention of the given `CredentialsProvider`.
 *
 * For use in e.g. the statusbar, selecting profiles in a menu, etc.
 * Includes information related to the credentials type, as well as
 * instance-identifying information.
 *
 * @param credentialsProviderId  Value to be formatted.
 *
 */
export function asString(credentialsProviderId: CredentialsProviderId): string {
    return [credentialsProviderId.credentialType, credentialsProviderId.credentialTypeId].join(
        CREDENTIALS_PROVIDER_ID_SEPARATOR
    )
}

export function fromString(credentialsProviderId: string): CredentialsProviderId {
    const separatorPos = credentialsProviderId.indexOf(CREDENTIALS_PROVIDER_ID_SEPARATOR)

    if (separatorPos === -1) {
        throw new Error(`Unexpected credentialsProviderId format: ${credentialsProviderId}`)
    }

    return {
        credentialType: credentialsProviderId.substring(0, separatorPos),
        credentialTypeId: credentialsProviderId.substring(separatorPos + 1),
    }
}

export function isEqual(idA: CredentialsProviderId, idB: CredentialsProviderId): boolean {
    return idA.credentialType === idB.credentialType && idA.credentialTypeId === idB.credentialTypeId
}
