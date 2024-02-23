/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { Token } from 'aws-sdk/lib/token'
import { Connection } from '../connection'
import { getLogger } from '../../shared/logger'

/**
 * {@link AWS.Token} is defined when {@link Token} is imported.
 * But for {@link Token} to not get tree-shaken we need to use it.
 * So the following simply uses it and now {@link AWS.Token} will not
 * be undefined anymore.
 */
Token
AWS.Token
let _TokenStub: typeof AWS.Token
if (AWS.Token === undefined) {
    getLogger().error('Tried importing AWS.Token but it is undefined.')
    _TokenStub = class X {} as any
} else {
    _TokenStub = AWS.Token as any
}

export class TokenProvider extends _TokenStub {
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
