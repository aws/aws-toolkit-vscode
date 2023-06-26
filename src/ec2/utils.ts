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
    const client = new Ec2Client(regionCode)
    return await client.getInstanceIds()
}
