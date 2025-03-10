/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SsmClient } from '../../shared/clients/ssm'
import { Disposable } from 'vscode'

export class Ec2SessionTracker extends Map<string, string> implements Disposable {
    public constructor(
        readonly regionCode: string,
        protected ssm: SsmClient
    ) {
        super()
    }

    public async addSession(instanceId: string, sessionId: string): Promise<void> {
        if (this.isConnectedTo(instanceId)) {
            const existingSessionId = this.get(instanceId)!
            await this.ssm.terminateSessionFromId(existingSessionId)
            this.set(instanceId, sessionId)
        } else {
            this.set(instanceId, sessionId)
        }
    }

    private async disconnectEnv(instanceId: string): Promise<void> {
        await this.ssm.terminateSessionFromId(this.get(instanceId)!)
        this.delete(instanceId)
    }

    public async dispose(): Promise<void> {
        // eslint-disable-next-line unicorn/no-array-for-each
        this.forEach(async (_sessionId, instanceId) => await this.disconnectEnv(instanceId))
    }

    public isConnectedTo(instanceId: string): boolean {
        return this.has(instanceId)
    }
}
