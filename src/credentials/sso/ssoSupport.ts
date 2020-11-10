/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { StartDeviceAuthorizationResponse } from 'aws-sdk/clients/ssooidc'
import { Profile } from '../../shared/credentials/credentialsFile'
import { hasProfileProperty } from '../credentialsUtilities'

const SSO_PROFILE_PROPERTIES = ['sso_start_url', 'sso_region', 'sso_account_id', 'sso_role_name']

export function validateSsoProfile(profile: Profile, profileName: string): string | undefined {
    const missingProperties = []

    for (const propertyName of SSO_PROFILE_PROPERTIES) {
        if (!hasProfileProperty(profile, propertyName)) {
            missingProperties.push(propertyName)
        }
    }

    if (missingProperties.length !== 0) {
        return `Profile ${profileName} is missing properties: ${missingProperties.join(', ')}`
    }

    return undefined
}

export function isSsoProfile(profile: Profile): boolean {
    for (const propertyName of SSO_PROFILE_PROPERTIES) {
        if (hasProfileProperty(profile, propertyName)) {
            return true
        }
    }
    return false
}

export async function openSsoPortalLink(authorization: StartDeviceAuthorizationResponse): Promise<boolean> {
    const linkOpened = await vscode.env.openExternal(vscode.Uri.parse(authorization.verificationUriComplete!))

    if (!linkOpened) {
        return false
    }
    return true
}
