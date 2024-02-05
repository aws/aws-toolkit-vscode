/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { Token } from 'aws-sdk/lib/token'
import { Connection } from '../connection'

/**
 * {@link AWS.Token} is defined when {@link Token} is imported.
 * But for {@link Token} to not get tree-shaken we need to use it.
 * So the following simply uses it and now {@link AWS.Token} will not
 * be undefined anymore.
 */
Token

export class TokenProvider extends AWS.Token {
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
