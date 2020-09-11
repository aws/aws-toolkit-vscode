/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { SsoAccessTokenProvider } from '../sso/ssoAccessTokenProvider'

export class SsoCredentialProvider {
    private ssoAccount: string
    private ssoRole: string
    private ssoClient: AWS.SSO
    private ssoAccessTokenProvider: SsoAccessTokenProvider

    constructor(
        ssoAccount: string,
        ssoRole: string,
        ssoClient: AWS.SSO,
        ssoAccessTokenProvider: SsoAccessTokenProvider
    ) {
        this.ssoAccount = ssoAccount
        this.ssoRole = ssoRole
        this.ssoClient = ssoClient
        this.ssoAccessTokenProvider = ssoAccessTokenProvider
    }

    public async refreshCredentials() {
        let roleCredentials
        try {
            const accessToken = await this.ssoAccessTokenProvider.accessToken()
            roleCredentials = await this.ssoClient
                .getRoleCredentials({
                    accountId: this.ssoAccount,
                    roleName: this.ssoRole,
                    accessToken: accessToken.accessToken,
                })
                .promise()
        } catch (err) {
            this.ssoAccessTokenProvider.invalidate()
            throw err
        }

        const awsCredentials = new AWS.Credentials({
            accessKeyId: roleCredentials.roleCredentials?.accessKeyId!,
            secretAccessKey: roleCredentials.roleCredentials?.secretAccessKey!,
            sessionToken: roleCredentials.roleCredentials?.sessionToken,
        })
        return awsCredentials
    }
}
