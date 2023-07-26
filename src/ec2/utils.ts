/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ec2Client, Ec2Instance } from '../shared/clients/ec2Client'

export interface Ec2Selection {
    instanceId: string
    region: string
}

export async function isEc2SelectionRunning(selection: Ec2Selection): Promise<boolean> {
    const client = new Ec2Client(selection.region)
    return await client.isInstanceRunning(selection.instanceId)
}

export function getIconForInstanceStatus(instance: Ec2Instance) {
    return `$(${getIconCodeForInstanceStatus(instance)})`
}

export function getIconCodeForInstanceStatus(instance: Ec2Instance) {
    if (instance.status === 'running') {
        return 'pass'
    }

    if (instance.status === 'stopped') {
        return 'circle-slash'
    }

    return 'loading~spin'
}
