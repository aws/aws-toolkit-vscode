/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { DefaultEc2Client } from '../shared/clients/ec2Client'

export async function getInstanceIdsFromRegion(regionCode: string): Promise<AsyncCollection<string>> {
    const client = new DefaultEc2Client(regionCode)
    return client.getInstanceIds()
}
