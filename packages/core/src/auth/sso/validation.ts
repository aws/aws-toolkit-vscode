/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { UnknownError } from '../../shared/errors'
import { AuthType } from '../auth'
import { SsoConnection, hasScopes, isAnySsoConnection } from '../connection'
import { ssoUrlFormatMessage, ssoUrlFormatRegex, ssoUrlProtocolMessage, ssoUrlProtocolRegex, ssoUrlExistsMessage } from './constants'

/**
 * Returns an error message if the url is not properly formatted.
 * Otherwise, returns undefined.
 */
export function validateSsoUrlFormat(url: string) {
    return !ssoUrlProtocolRegex.test(url) ? ssoUrlProtocolMessage
        : !ssoUrlFormatRegex.test(url) ? ssoUrlFormatMessage
        : undefined;
}

export async function validateIsNewSsoUrlAsync(
    auth: AuthType,
    url: string,
    requiredScopes?: string[]
): Promise<string | undefined> {
    return auth.listConnections().then((conns) => {
        return validateIsNewSsoUrl(url, requiredScopes, conns.filter(isAnySsoConnection))
    })
}

export function validateIsNewSsoUrl(
    url: string,
    requiredScopes?: string[],
    existingSsoConns: SsoConnection[] = []
): string | undefined {
    try {
        const uri = vscode.Uri.parse(url, true)
        const isSameAuthority = (a: vscode.Uri, b: vscode.Uri) =>
            a.authority.toLowerCase() === b.authority.toLowerCase()
        const oldConn = existingSsoConns.find((conn) => isSameAuthority(vscode.Uri.parse(conn.startUrl), uri))

        if (oldConn && (!requiredScopes || hasScopes(oldConn, requiredScopes))) {
            return ssoUrlExistsMessage
        }
    } catch (err) {
        return `URL is malformed: ${UnknownError.cast(err).message}`
    }
}
