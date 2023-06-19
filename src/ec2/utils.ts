/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { Ec2Client } from '../shared/clients/ec2Client'

export interface Ec2Selection {
    instanceId: string
    region: string
}

export async function getInstanceIdsFromRegion(regionCode: string): Promise<AsyncCollection<string>> {
<<<<<<< HEAD
    const client = new DefaultEc2Client(regionCode)
    return await client.getInstanceIds()
=======
    const client = new Ec2Client(regionCode)
    return client.getInstanceIds()
>>>>>>> hkobew/ec2/connect
}
