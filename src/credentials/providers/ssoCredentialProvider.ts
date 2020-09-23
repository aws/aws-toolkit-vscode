/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Credentials, SSO } from 'aws-sdk'
import { getLogger } from '../../shared/logger'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'

export class SsoCredentialProvider {
    private ssoAccount: string
    private ssoRole: string
    private ssoClient: SSO
    private ssoAccessTokenProvider: SsoAccessTokenProvider

    constructor(ssoAccount: string, ssoRole: string, ssoClient: SSO, ssoAccessTokenProvider: SsoAccessTokenProvider) {
        this.ssoAccount = ssoAccount
        this.ssoRole = ssoRole
        this.ssoClient = ssoClient
        this.ssoAccessTokenProvider = ssoAccessTokenProvider
    }

    public async refreshCredentials() {
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
            this.ssoAccessTokenProvider.invalidate()
            getLogger().error(err)
            throw err
        }
    }
}
