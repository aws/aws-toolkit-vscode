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
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { ssoAuthHelpUrl } from '../../shared/constants'
import { openUrl } from '../../shared/utilities/vsCodeUtils'
import { ToolkitError } from '../../shared/errors'
import { isCloud9 } from '../../shared/extensionUtilities'

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
export const trustedDomainCancellation = 'TrustedDomainCancellation'

const tryOpenHelpUrl = (url: vscode.Uri) =>
    openUrl(url).catch(e => getLogger().verbose('auth: failed to open help URL: %s', e))

export function truncateStartUrl(startUrl: string) {
    return startUrl.match(/https?:\/\/(.*)\.awsapps\.com\/start/)?.[1] ?? startUrl
}

type Authorization = { readonly verificationUri: string; readonly userCode: string }

export const proceedToBrowser = localize('AWS.auth.loginWithBrowser.proceedToBrowser', 'Proceed To Browser')

export async function openSsoPortalLink(startUrl: string, authorization: Authorization): Promise<boolean> {
    /**
     * Depending on the verification URL + parameters used, the way the sso login flow works changes.
     * Previously, users were asked to copy and paste a device code in to the browser page.
     *
     * Now, with the URL this function creates, the user will instead be asked to confirm the device code
     * in the browser.
     */
    function makeConfirmCodeUrl(authorization: Authorization): vscode.Uri {
        return vscode.Uri.parse(`${authorization.verificationUri}?user_code=${authorization.userCode}`)
    }

    async function openSsoUrl() {
        const ssoLoginUrl = makeConfirmCodeUrl(authorization)
        const didOpenUrl = await vscode.env.openExternal(ssoLoginUrl)

        if (!didOpenUrl) {
            throw new ToolkitError(`User clicked 'Copy' or 'Cancel' during the Trusted Domain popup`, {
                code: trustedDomainCancellation,
                name: trustedDomainCancellation,
                cancelled: true,
            })
        }
        return didOpenUrl
    }

    async function showLoginNotification() {
        const name = startUrl === builderIdStartUrl ? localizedText.builderId() : localizedText.iamIdentityCenterFull()
        // C9 doesn't support `detail` field with modals so we need to put it all in the `title`
        const title = isCloud9()
            ? `Confirm Code "${authorization.userCode}" for ${name} in the browser.`
            : localize('AWS.auth.loginWithBrowser.messageTitle', 'Confirm Code for {0}', name)
        const detail = localize(
            'AWS.auth.loginWithBrowser.messageDetail',
            'Confirm this code in the browser: {0}',
            authorization.userCode
        )

        while (true) {
            // TODO: add the 'Help' item back once we have a suitable URL
            // const resp = await vscode.window.showInformationMessage(title, options, copyCode, localizedText.help)
            const resp = await vscode.window.showInformationMessage(title, { modal: true, detail }, proceedToBrowser)
            switch (resp) {
                case proceedToBrowser:
                    return openSsoUrl()
                case localizedText.help:
                    await tryOpenHelpUrl(ssoAuthHelpUrl)
                    continue
                default:
                    throw new CancellationError('user')
            }
        }
    }

    return showLoginNotification()
}

// Most SSO 'expirables' are fairly long lived, so a one minute buffer is plenty.
const expirationBufferMs = 60000
export function isExpired(expirable: { expiresAt: Date }): boolean {
    return globals.clock.Date.now() + expirationBufferMs >= expirable.expiresAt.getTime()
}
