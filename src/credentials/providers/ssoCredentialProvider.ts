/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { SsoAccessTokenProvider } from '../ssoAccessTokenProvider'

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

    //  private refreshCredentials(): AWS.Credentials {
    //     let roleCredentials
    //     try {
    //         const accessToken = this.ssoAccessTokenProvider.accessToken()
    //     }
    //  }

    deleteThis() {
        console.log(typeof this.ssoAccount + this.ssoRole + this.ssoClient)
        this.ssoAccessTokenProvider
    }
}
