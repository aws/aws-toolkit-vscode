/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ec2Client } from '../shared/clients/ec2Client'
import { ToolkitError, isAwsError } from '../shared/errors'
import { showMessageWithCancel } from '../shared/utilities/messages'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { Ec2Selection } from './utils'

export class InstanceStateManager {
    private readonly client: Ec2Client

    public constructor(protected readonly instanceId: string, protected readonly regionCode: string) {
        this.client = this.getEc2Client()
    }

    protected getEc2Client() {
        return new Ec2Client(this.regionCode)
    }

    protected async ensureInstanceNotInStatus(targetStatus: string) {
        const isAlreadyInStatus = (await this.client.getInstanceStatus(this.instanceId)) == targetStatus
        if (isAlreadyInStatus) {
            throw new ToolkitError(
                `EC2: Instance is currently ${targetStatus}. Unable to update status of ${this.instanceId}.`
            )
        }
    }

    private handleError(err: unknown) {
        if (isAwsError(err)) {
            throw new ToolkitError(`EC2: failed to change status of instance ${this.instanceId}`, {
                cause: err as Error,
            })
        } else {
            throw err
        }
    }

    public async startInstanceWithCancel(): Promise<void> {
        const timeout = new Timeout(5000)

        await showMessageWithCancel(`EC2: Starting instance ${this.instanceId}`, timeout)

        try {
            await this.ensureInstanceNotInStatus('running')
            await this.client.startInstance(this.instanceId)
        } catch (err) {
            this.handleError(err)
        } finally {
            timeout.cancel()
        }
    }

    public async stopInstanceWithCancel(): Promise<void> {
        const timeout = new Timeout(5000)

        await showMessageWithCancel(`EC2: Stopping instance ${this.instanceId}`, timeout)

        try {
            await this.ensureInstanceNotInStatus('stopped')
            await this.client.stopInstance(this.instanceId)
        } catch (err) {
            this.handleError(err)
        } finally {
            timeout.cancel()
        }
    }

    public async rebootInstanceWithCancel(): Promise<void> {
        const timeout = new Timeout(5000)

        await showMessageWithCancel(`EC2: Rebooting instance ${this.instanceId}`, timeout)

        try {
            await this.client.rebootInstance(this.instanceId)
        } catch (err) {
            this.handleError(err)
        } finally {
            timeout.cancel()
        }
    }
}

export function getStateManagerForSelection(selection: Ec2Selection) {
    return new InstanceStateManager(selection.instanceId, selection.region)
}
