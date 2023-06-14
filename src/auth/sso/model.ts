/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ssoAuthHelpUrl } from '../../shared/constants'
import { openUrl } from '../../shared/utilities/vsCodeUtils'

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

export const builderIdStartUrl = 'https://view.awsapps.com/start'

const tryOpenHelpUrl = (url: vscode.Uri) =>
    openUrl(url).catch(e => getLogger().verbose('auth: failed to open help URL: %s', e))

export async function openSsoPortalLink(
    startUrl: string,
    authorization: { readonly verificationUri: string; readonly userCode: string }
): Promise<boolean> {
    async function copyCodeAndOpenLink() {
        await vscode.env.clipboard.writeText(authorization.userCode).then(undefined, err => {
            getLogger().warn(`auth: failed to copy user code "${authorization.userCode}" to clipboard: %s`, err)
        })

        return vscode.env.openExternal(vscode.Uri.parse(authorization.verificationUri))
    }

    async function showLoginNotification() {
        const name = startUrl === builderIdStartUrl ? localizedText.builderId() : localizedText.iamIdentityCenterFull()
        const title = localize('AWS.auth.loginWithBrowser.messageTitle', 'Copy Code for {0}', name)
        const detail = localize(
            'AWS.auth.loginWithBrowser.messageDetail',
            'To proceed, open the login page and provide this code to confirm the access request: {0}',
            authorization.userCode
        )
        const copyCode = localize('AWS.auth.loginWithBrowser.copyCodeAction', 'Copy Code and Proceed')
        const options = { modal: true, detail } as vscode.MessageOptions

        while (true) {
            // TODO: add the 'Help' item back once we have a suitable URL
            // const resp = await vscode.window.showInformationMessage(title, options, copyCode, localizedText.help)
            const resp = await vscode.window.showInformationMessage(title, options, copyCode)
            switch (resp) {
                case copyCode:
                    return copyCodeAndOpenLink()
                case localizedText.help:
                    await tryOpenHelpUrl(ssoAuthHelpUrl)
                    continue
                default:
                    throw new CancellationError('user')
            }
        }
    }

    return telemetry.aws_loginWithBrowser.run(() => showLoginNotification())
}

// Most SSO 'expirables' are fairly long lived, so a one minute buffer is plenty.
const expirationBufferMs = 60000
export function isExpired(expirable: { expiresAt: Date }): boolean {
    return globals.clock.Date.now() + expirationBufferMs >= expirable.expiresAt.getTime()
}
