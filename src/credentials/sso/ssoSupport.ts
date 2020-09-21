/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Profile } from '../../shared/credentials/credentialsFile'

const SSO_PROFILE_PROPERTY = {
    SSO_START_URL: 'sso_start_url',
    SSO_REGION: 'sso_region',
    SSO_ACCOUNT_ID: 'sso_account_id',
    SSO_ROLE_NAME: 'sso_role_name',
}

export function validateSsoProfile(profile: Profile, profileName: string): string | undefined {
    const missingProperties = []

    if (!hasProfileProperty(profile, SSO_PROFILE_PROPERTY.SSO_START_URL)) {
        missingProperties.push(SSO_PROFILE_PROPERTY.SSO_START_URL)
    }

    if (!hasProfileProperty(profile, SSO_PROFILE_PROPERTY.SSO_REGION)) {
        missingProperties.push(SSO_PROFILE_PROPERTY.SSO_REGION)
    }

    if (!hasProfileProperty(profile, SSO_PROFILE_PROPERTY.SSO_ACCOUNT_ID)) {
        missingProperties.push(SSO_PROFILE_PROPERTY.SSO_ACCOUNT_ID)
    }

    if (!hasProfileProperty(profile, SSO_PROFILE_PROPERTY.SSO_ROLE_NAME)) {
        missingProperties.push(SSO_PROFILE_PROPERTY.SSO_ROLE_NAME)
    }
    if (missingProperties.length !== 0) {
        return `Profile ${profileName} is missing properties: ${missingProperties.join(', ')}`
    }

    return undefined
}

export function isSsoProfile(profile: Profile): boolean {
    return (
        hasProfileProperty(profile, SSO_PROFILE_PROPERTY.SSO_START_URL) ||
        hasProfileProperty(profile, SSO_PROFILE_PROPERTY.SSO_REGION) ||
        hasProfileProperty(profile, SSO_PROFILE_PROPERTY.SSO_ACCOUNT_ID) ||
        hasProfileProperty(profile, SSO_PROFILE_PROPERTY.SSO_ROLE_NAME)
    )
}

function hasProfileProperty(profile: Profile, propertyName: string): boolean {
    return !!profile[propertyName]
}
