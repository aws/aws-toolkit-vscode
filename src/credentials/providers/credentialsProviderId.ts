/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const CREDENTIALS_PROVIDER_ID_SEPARATOR = ':'

export interface CredentialsProviderIdComponents {
    credentialType: string
    providerId: string
}

export function makeCredentialsProviderIdComponents(credentialsProviderId: string): CredentialsProviderIdComponents {
    const chunks = credentialsProviderId.split(CREDENTIALS_PROVIDER_ID_SEPARATOR)

    if (chunks.length !== 2) {
        throw new Error(`Unexpected credentialsProviderId format: ${credentialsProviderId}`)
    }

    return {
        credentialType: chunks[0],
        providerId: chunks[1]
    }
}

export function makeCredentialsProviderId(credentialsProviderIdComponents: CredentialsProviderIdComponents): string {
    return [credentialsProviderIdComponents.credentialType, credentialsProviderIdComponents.providerId].join(
        CREDENTIALS_PROVIDER_ID_SEPARATOR
    )
}
