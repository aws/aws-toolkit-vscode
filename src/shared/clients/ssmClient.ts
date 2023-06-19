/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM, Session, TerminateSessionResponse, StartSessionResponse } from '@aws-sdk/client-ssm'
import { getLogger } from '../logger/logger'

export class DefaultSsmClient {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<SSM> {
        return new SSM({ region: this.regionCode })
    }

    public async terminateSession(session: Session): Promise<TerminateSessionResponse> {
        const sessionId = session.SessionId!
        const client = await this.createSdkClient()
        const termination = await client.terminateSession({ SessionId: sessionId }).catch(err => {
            getLogger().warn(`ssm: failed to terminate session "${sessionId}": %s`, err)
        })

        return termination!
    }

    public async startSession(target: string): Promise<StartSessionResponse> {
        const client = await this.createSdkClient()
        const response = await client.startSession({ Target: target })
        return response
    }
}
