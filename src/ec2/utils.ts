/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ec2Client } from '../shared/clients/ec2Client'

export interface Ec2Selection {
    instanceId: string
    region: string
}

export async function isEc2SelectionRunning(selection: Ec2Selection): Promise<boolean> {
    const client = new Ec2Client(selection.region)
    return await client.isInstanceRunning(selection.instanceId)
}
