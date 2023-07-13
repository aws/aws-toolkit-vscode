/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ec2Client } from '../shared/clients/ec2Client'
import { ToolkitError, isAwsError } from '../shared/errors'
import { showMessageWithCancel } from '../shared/utilities/messages'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { Ec2Selection } from './utils'

async function ensureInstanceNotInStatus(client: Ec2Client, instanceId: string, targetStatus: string) {
    const isAlreadyRunning = (await client.getInstanceStatus(instanceId)) == targetStatus
    if (isAlreadyRunning) {
        throw new ToolkitError(`EC2: Instance already ${targetStatus}. Unable to update status of ${instanceId}.`)
    }
}

export async function startInstanceWithCancel(selection: Ec2Selection): Promise<void> {
    const client = new Ec2Client(selection.region)
    const timeout = new Timeout(5000)

    await showMessageWithCancel(`EC2: Starting instance ${selection.instanceId}`, timeout)

    try {
        await ensureInstanceNotInStatus(client, selection.instanceId, 'running')
        await client.startInstance(selection.instanceId)
    } catch (err) {
        if (isAwsError(err)) {
            throw new ToolkitError(`EC2: failed to start instance ${selection.instanceId}`, { cause: err as Error })
        } else {
            throw err
        }
    } finally {
        timeout.cancel()
    }
}

export async function stopInstanceWithCancel(selection: Ec2Selection): Promise<void> {
    const client = new Ec2Client(selection.region)
    const timeout = new Timeout(5000)

    await showMessageWithCancel(`EC2: Stopping instance ${selection.instanceId}`, timeout)

    try {
        await ensureInstanceNotInStatus(client, selection.instanceId, 'stopped')
        await client.stopInstance(selection.instanceId)
    } catch (err) {
        if (isAwsError(err)) {
            throw new ToolkitError(`EC2: failed to stop instance ${selection.instanceId}`, { cause: err as Error })
        } else {
            throw err
        }
    } finally {
        timeout.cancel()
    }
}
