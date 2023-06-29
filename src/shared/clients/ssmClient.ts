/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import { getLogger } from '../logger/logger'
import globals from '../extensionGlobals'

export class SsmClient {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<SSM> {
        return await globals.sdkClientBuilder.createAwsService(SSM, undefined, this.regionCode)
    }

    public async terminateSession(session: SSM.Session): Promise<SSM.TerminateSessionResponse> {
        const sessionId = session.SessionId!
        const client = await this.createSdkClient()
        const termination = await client
            .terminateSession({ SessionId: sessionId })
            .promise()
            .catch(err => {
                getLogger().warn(`ssm: failed to terminate session "${sessionId}": %s`, err)
            })

        return termination!
    }

    public async startSession(target: string): Promise<SSM.StartSessionResponse> {
        const client = await this.createSdkClient()
        const response = await client.startSession({ Target: target }).promise()
        return response
    }
}
