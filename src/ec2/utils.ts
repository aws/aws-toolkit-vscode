/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { Ec2Client, Ec2Instance } from '../shared/clients/ec2Client'

export interface Ec2Selection {
    instanceId: string
    region: string
}

export async function getInstancesFromRegion(regionCode: string): Promise<AsyncCollection<Ec2Instance>> {
    const client = new Ec2Client(regionCode)
    return await client.getInstances()
}
