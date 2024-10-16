/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2, SSM } from 'aws-sdk'
import { SsmClient } from '../../shared/clients/ssmClient'
import { Disposable } from 'vscode'

export class Ec2SessionTracker extends Map<EC2.InstanceId, SSM.SessionId> implements Disposable {
    public constructor(
        readonly regionCode: string,
        protected ssmClient: SsmClient
    ) {
        super()
    }

    public async addSession(instanceId: EC2.InstanceId, sessionId: SSM.SessionId): Promise<void> {
        if (this.isConnectedTo(instanceId)) {
            const existingSessionId = this.get(instanceId)!
            await this.ssmClient.terminateSessionFromId(existingSessionId)
            this.set(instanceId, sessionId)
        } else {
            this.set(instanceId, sessionId)
        }
    }

    private async disconnectEnv(instanceId: EC2.InstanceId): Promise<void> {
        await this.ssmClient.terminateSessionFromId(this.get(instanceId)!)
        this.delete(instanceId)
    }

    public async dispose(): Promise<void> {
        this.forEach(async (_sessionId, instanceId) => await this.disconnectEnv(instanceId))
    }

    public isConnectedTo(instanceId: EC2.InstanceId): boolean {
        return this.has(instanceId)
    }
}
