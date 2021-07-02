/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { StartDeviceAuthorizationResponse } from 'aws-sdk/clients/ssooidc'
import { Profile } from '../../shared/credentials/credentialsFile'
import { SsoClientRegistration } from './ssoClientRegistration'
import { hasProfileProperty } from '../credentialsUtilities'

export const SSO_PROFILE_PROPERTIES = ['sso_start_url', 'sso_region', 'sso_account_id', 'sso_role_name']

export interface SsoAccessToken {
    /**
     * The configured sso_start_url for the profile being resolved for.  This is provided by
     * the SSO service via the console and is the main URL customers use to login to their SSO directory.
     */
    readonly startUrl: string

    /**
     * The AWS region where the SSO directory for the given startUrl is hosted.
     */
    readonly region: string

    /**
     * A base64 encoded string returned by the SSO-OIDC service. This token must be treated as an
     * opaque UTF-8 string and must not be decoded.
     */
    readonly accessToken: string

    /**
     * The expiration time of the accessToken as an RFC 3339 formatted timestamp.
     */
    readonly expiresAt: string
}

export interface SsoCache {
    loadClientRegistration(ssoRegion: string): SsoClientRegistration | undefined
    saveClientRegistration(ssoRegion: string, registration: SsoClientRegistration): void
    invalidateClientRegistration(ssoRegion: string): void

    loadAccessToken(ssoUrl: string): SsoAccessToken | undefined
    saveAccessToken(ssoUrl: string, accessToken: SsoAccessToken): void
    invalidateAccessToken(ssoUrl: string): void
}

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

export async function openSsoPortalLink(authorization: StartDeviceAuthorizationResponse): Promise<boolean> {
    const linkOpened = await vscode.env.openExternal(vscode.Uri.parse(authorization.verificationUriComplete!))

    if (!linkOpened) {
        return false
    }
    return true
}
