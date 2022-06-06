/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Credentials } from '@aws-sdk/types'
import { SSO, UnauthorizedException } from '@aws-sdk/client-sso'
import { getLogger } from '../../shared/logger'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

export class SsoCredentialProvider {
    public constructor(
        private ssoAccount: string,
        private ssoRole: string,
        private ssoClient: SSO,
        private ssoAccessTokenProvider: SsoAccessTokenProvider
    ) {}

    public async refreshCredentials(): Promise<Credentials> {
        try {
            const accessToken = await this.ssoAccessTokenProvider.accessToken()
            const roleCredentials = await this.ssoClient
                .getRoleCredentials({
                    accountId: this.ssoAccount,
                    roleName: this.ssoRole,
                    accessToken: accessToken.accessToken,
                })
                .then(resp => resp.roleCredentials)

            const expiration = roleCredentials?.expiration ? new Date(roleCredentials.expiration) : undefined

            return {
                accessKeyId: roleCredentials!.accessKeyId!,
                secretAccessKey: roleCredentials!.secretAccessKey!,
                sessionToken: roleCredentials?.sessionToken,
                expiration,
            }
        } catch (err) {
            if (err instanceof UnauthorizedException) {
                this.ssoAccessTokenProvider.invalidate()
            }
            vscode.window.showErrorMessage(
                localize('AWS.message.credentials.sso.error', 'Failed to load SSO credentials. Try logging in again.')
            )
            getLogger().error(err as Error)
            throw err
        }
    }
}
