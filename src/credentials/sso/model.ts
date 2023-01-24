/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'

import * as vscode from 'vscode'

export interface SsoToken {
    /**
     * An optional identity associated with this token.
     */
    readonly identity?: string

    /**
     * A base64 encoded string returned by the SSO-OIDC service. This token must be treated as an
     * opaque UTF-8 string and must not be decoded.
     */
    readonly accessToken: string

    /**
     * The expiration time of the accessToken.
     */
    readonly expiresAt: Date

    /**
     * Should always be `Bearer` if present.
     */
    readonly tokenType?: string

    /**
     * Opaque token that may be used to 'refresh' the authentication session after expiration.
     */
    readonly refreshToken?: string
}

export interface ClientRegistration {
    /**
     * Unique registration id.
     */
    readonly clientId: string

    /**
     * Secret key associated with the registration.
     */
    readonly clientSecret: string

    /**
     * The expiration time of the registration.
     */
    readonly expiresAt: Date

    /**
     * Scope of the client registration. Applies to all tokens created using this registration.
     */
    readonly scopes?: string[]
}

export interface SsoProfile {
    readonly region: string
    readonly startUrl: string
    readonly accountId?: string
    readonly roleName?: string
    readonly scopes?: string[]
    readonly identifier?: string
}

export async function openSsoPortalLink(authorization: { readonly verificationUriComplete: string }): Promise<boolean> {
    return vscode.env.openExternal(vscode.Uri.parse(authorization.verificationUriComplete))
}

// Most SSO 'expirables' are fairly long lived, so a one minute buffer is plenty.
const expirationBufferMs = 60000
export function isExpired(expirable: { expiresAt: Date }): boolean {
    return globals.clock.Date.now() + expirationBufferMs >= expirable.expiresAt.getTime()
}
