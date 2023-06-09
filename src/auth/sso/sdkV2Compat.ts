/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { Token } from 'aws-sdk/lib/token'
import { Connection } from '../connection'

const TokenClass = (AWS as any).Token as typeof Token
export class TokenProvider extends TokenClass {
    public constructor(private readonly connection: Connection & { type: 'sso' }) {
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
