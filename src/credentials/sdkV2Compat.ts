/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError } from 'aws-sdk'
import { Token } from 'aws-sdk/lib/token'
import { Connection } from './auth'

export class TokenProvider extends Token {
    public constructor(private readonly connection: Connection & { type: 'sso' }) {
        super({ token: '', expireTime: new Date(0) })
    }

    public override get(cb: (err?: AWSError | undefined) => void): void {
        if (!this.token || this.needsRefresh()) {
            this.refresh(cb)
        }

        cb()
    }

    public override refresh(cb: (err?: AWSError | undefined) => void): void {
        this.connection
            .getToken()
            .then(({ accessToken, expiresAt }) => {
                this.token = accessToken
                this.expireTime = expiresAt
                this.expired = false
            })
            .catch(cb)
    }
}
