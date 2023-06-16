/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError, SSM } from 'aws-sdk'
import globals from '../extensionGlobals'
import { PromiseResult } from 'aws-sdk/lib/request'
import { getLogger } from '../logger/logger'

export class DefaultSsmClient {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<SSM> {
        return await globals.sdkClientBuilder.createAwsService(SSM, undefined, this.regionCode)
    }

    public async terminateSession(
        session: SSM.Session
    ): Promise<void | PromiseResult<SSM.TerminateSessionResponse, AWSError>> {
        const sessionId = session.SessionId!
        const client = await this.createSdkClient()
        const termination = await client
            .terminateSession({ SessionId: sessionId })
            .promise()
            .catch(err => {
                getLogger().warn(`ssm: failed to terminate session "${sessionId}": %s`, err)
            })
        return termination
    }

    public async startSession(target: string): Promise<PromiseResult<SSM.StartSessionResponse, AWSError>> {
        const client = await this.createSdkClient()
        const response = await client.startSession({ Target: target }).promise()
        return response
    }
}
