/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { CredentialsOptions } from 'aws-sdk/lib/credentials'
import { Token } from 'aws-sdk/lib/token'
import { IamConnection, SsoConnection } from './auth'

const TokenClass = (AWS as any).Token as typeof Token
export class SdkTokenProvider extends TokenClass {
    public constructor(private readonly connection: SsoConnection) {
        super({ token: '', expireTime: new Date(0) })
    }

    public override get(cb: (err?: AWS.AWSError | undefined) => void): void {
        if (!this.token || this.needsRefresh()) {
            this.refresh(cb)
        } else {
            cb()
        }
    }

    public override refresh(cb: (err?: AWS.AWSError | undefined) => void): void {
        this.connection
            .getToken()
            .then(({ accessToken, expiresAt }) => {
                this.token = accessToken
                this.expireTime = expiresAt
                this.expired = false
                cb()
            })
            .catch(cb)
    }
}

export class SdkCredentialsProvider extends AWS.Credentials {
    public constructor(private readonly connection: IamConnection) {
        super({ accessKeyId: '', secretAccessKey: '' })
    }

    public override get(cb: (err?: AWS.AWSError) => void): void {
        if (!this.accessKeyId || this.needsRefresh()) {
            this.refresh(cb)
        } else {
            cb()
        }
    }

    public override refresh(cb: (err?: AWS.AWSError) => void): void {
        this.connection
            .getCredentials()
            .then(creds => {
                this.loadCreds(creds)
                // The SDK V2 sets `expired` on certain errors so we should only
                // unset the flag after acquiring new credentials via `refresh`
                this.expired = false
                cb()
            })
            .catch(cb)
    }

    private loadCreds(creds: CredentialsOptions & { expiration?: Date }) {
        this.accessKeyId = creds.accessKeyId
        this.secretAccessKey = creds.secretAccessKey
        this.sessionToken = creds.sessionToken ?? this.sessionToken
        this.expireTime = creds.expiration ?? this.expireTime
    }
}
