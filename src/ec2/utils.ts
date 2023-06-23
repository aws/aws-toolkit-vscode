/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { Ec2Client } from '../shared/clients/ec2Client'
import { Instance } from '@aws-sdk/client-ec2'

export interface Ec2Selection {
    instanceId: string
    region: string
}

export async function getInstancesFromRegion(regionCode: string): Promise<AsyncCollection<Instance>> {
    const client = new Ec2Client(regionCode)
    return await client.getInstances()
}
