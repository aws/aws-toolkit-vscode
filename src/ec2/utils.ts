/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncCollection } from '../shared/utilities/asyncCollection'
<<<<<<< HEAD
import { Ec2Client } from '../shared/clients/ec2Client'
import { Instance } from '@aws-sdk/client-ec2'
=======
import { Ec2Client, Ec2Instance } from '../shared/clients/ec2Client'
>>>>>>> master

export interface Ec2Selection {
    instanceId: string
    region: string
}

<<<<<<< HEAD
export async function getInstancesFromRegion(regionCode: string): Promise<AsyncCollection<Instance>> {
=======
export async function getInstancesFromRegion(regionCode: string): Promise<AsyncCollection<Ec2Instance>> {
>>>>>>> master
    const client = new Ec2Client(regionCode)
    return await client.getInstances()
}
