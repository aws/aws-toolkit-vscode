/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2, SSM } from 'aws-sdk'
import { SsmClient } from '../../shared/clients/ssmClient'

export class Ec2RemoteSessionManager {
    private activeSessions: Map<EC2.InstanceId, SSM.SessionId>

    public constructor(
        readonly regionCode: string,
        protected ssmClient: SsmClient
    ) {
        this.activeSessions = new Map<EC2.InstanceId, SSM.SessionId>()
    }

    public async addSession(instanceId: EC2.InstanceId, sessionId: SSM.SessionId): Promise<void> {
        if (this.isConnectedTo(instanceId)) {
            const existingSessionId = this.activeSessions.get(instanceId)!
            await this.ssmClient.terminateSessionFromId(existingSessionId)
            this.activeSessions.set(instanceId, sessionId)
        } else {
            this.activeSessions.set(instanceId, sessionId)
        }
    }

    private async disconnectEnv(instanceId: EC2.InstanceId): Promise<void> {
        await this.ssmClient.terminateSessionFromId(this.activeSessions.get(instanceId)!)
        this.activeSessions.delete(instanceId)
    }

    public async closeConnections(): Promise<void> {
        this.activeSessions.forEach(async (_sessionId, instanceId) => await this.disconnectEnv(instanceId))
    }

    public isConnectedTo(instanceId: EC2.InstanceId): boolean {
        return this.activeSessions.has(instanceId)
    }
}
