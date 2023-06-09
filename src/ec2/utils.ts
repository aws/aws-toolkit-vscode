/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2 } from 'aws-sdk'
import { AsyncCollection } from "../shared/utilities/asyncCollection"
import globals from '../shared/extensionGlobals'
import { pageableToCollection } from '../shared/utilities/collectionUtils'

export function extractInstanceIdsFromReservations(reservations: AsyncCollection<EC2.ReservationList | undefined>): AsyncCollection<string> {
    return reservations
        .flatten()
        .map(instanceList => instanceList?.Instances)
        .flatten()
        .map(instance => instance?.InstanceId)
        .filter(instanceId => instanceId !== undefined)
} 

export async function getInstanceIdsFromRegion(regionCode: string): Promise<AsyncCollection<string>> {
    const client = await globals.sdkClientBuilder.createAwsService(EC2, undefined, regionCode)
    const requester = async (request: EC2.DescribeInstancesRequest) => 
        client.describeInstances(request).promise() 
        
    const instanceIds = extractInstanceIdsFromReservations(pageableToCollection(requester, {}, 'NextToken', 'Reservations'))
    return instanceIds
}
