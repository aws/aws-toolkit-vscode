/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Credentials, SSO } from 'aws-sdk'
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
                .promise()

            return new Credentials({
                accessKeyId: roleCredentials.roleCredentials?.accessKeyId!,
                secretAccessKey: roleCredentials.roleCredentials?.secretAccessKey!,
                sessionToken: roleCredentials.roleCredentials?.sessionToken,
            })
        } catch (err) {
            if (err.code === 'UnauthorizedException') {
                this.ssoAccessTokenProvider.invalidate()
            }
            vscode.window.showErrorMessage(
                localize('AWS.message.credentials.sso.error', 'Failed to load SSO credentials. Try logging in again.')
            )
            getLogger().error(err)
            throw err
        }
    }
}
