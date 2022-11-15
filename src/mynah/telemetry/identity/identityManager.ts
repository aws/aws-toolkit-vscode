/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CognitoIdentityClient, GetIdCommand } from '@aws-sdk/client-cognito-identity'

export class IdentityManager {
    private pendingIdentity: Promise<string> | undefined

    constructor(private readonly client: CognitoIdentityClient, private readonly identityPoolId: string) {
        this.pendingIdentity = undefined
    }

    public getIdentity(): Promise<string> {
        if (this.pendingIdentity) {
            return this.pendingIdentity
        }
        this.pendingIdentity = this.getNewIdentity()
        return this.pendingIdentity
    }

    private async getNewIdentity(): Promise<string> {
        const command = new GetIdCommand({ IdentityPoolId: this.identityPoolId })
        const output = await this.client.send(command)
        return output.IdentityId as string
    }
}
