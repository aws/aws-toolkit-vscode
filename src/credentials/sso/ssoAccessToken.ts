/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
