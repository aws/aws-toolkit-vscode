/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2, SSM } from 'aws-sdk'
import { SsmClient } from '../../shared/clients/ssmClient'

export class Ec2RemoteSessionManager {
    private activeEnvs: Map<EC2.InstanceId, SSM.SessionId>

    public constructor(
        readonly regionCode: string,
        protected ssmClient: SsmClient
    ) {
        this.activeEnvs = new Map<EC2.InstanceId, SSM.SessionId>()
    }

    public async addEnv(instanceId: EC2.InstanceId, sessionId: SSM.SessionId): Promise<void> {
        if (this.isConnectedTo(instanceId)) {
            const existingSessionId = this.activeEnvs.get(instanceId)!
            await this.ssmClient.terminateSessionFromId(existingSessionId)
            this.activeEnvs.set(instanceId, sessionId)
        } else {
            this.activeEnvs.set(instanceId, sessionId)
        }
    }

    private async disconnectEnv(instanceId: EC2.InstanceId): Promise<void> {
        await this.ssmClient.terminateSessionFromId(this.activeEnvs.get(instanceId)!)
        this.activeEnvs.delete(instanceId)
    }

    public async closeConnections(): Promise<void> {
        this.activeEnvs.forEach(async (_sessionId, instanceId) => await this.disconnectEnv(instanceId))
    }

    public isConnectedTo(instanceId: EC2.InstanceId): boolean {
        return this.activeEnvs.has(instanceId)
    }
}
