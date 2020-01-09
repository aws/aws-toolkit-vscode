/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const CREDENTIALS_PROVIDER_ID_SEPARATOR = '|'

export interface CredentialsProviderIdComponents {
    credentialType: string
    credentialTypeId: string
}

export function makeCredentialsProviderIdComponents(credentialsProviderId: string): CredentialsProviderIdComponents {
    const separatorPos = credentialsProviderId.indexOf(CREDENTIALS_PROVIDER_ID_SEPARATOR)

    if (separatorPos === -1) {
        throw new Error(`Unexpected credentialsProviderId format: ${credentialsProviderId}`)
    }

    return {
        credentialType: credentialsProviderId.substring(0, separatorPos),
        credentialTypeId: credentialsProviderId.substring(separatorPos + 1)
    }
}

export function makeCredentialsProviderId(credentialsProviderIdComponents: CredentialsProviderIdComponents): string {
    return [credentialsProviderIdComponents.credentialType, credentialsProviderIdComponents.credentialTypeId].join(
        CREDENTIALS_PROVIDER_ID_SEPARATOR
    )
}
