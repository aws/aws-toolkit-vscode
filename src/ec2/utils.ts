/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { EC2 } from 'aws-sdk'
import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { pageableToCollection } from '../shared/utilities/collectionUtils'

export type Ec2InstanceId = string

export type Ec2Selection = {
    instanceId: Ec2InstanceId
    region: string
}

export function extractInstanceIdsFromReservations(
    reservations: AsyncCollection<EC2.ReservationList | undefined>
): AsyncCollection<string> {
    return reservations
        .flatten()
        .map(instanceList => instanceList?.Instances)
        .flatten()
        .map(instance => instance?.InstanceId)
        .filter(instanceId => instanceId !== undefined)
}

export async function getInstanceIdsFromClient(client: EC2): Promise<AsyncCollection<string>> {
    const requester = async (request: EC2.DescribeInstancesRequest) => client.describeInstances(request).promise()

    const instanceIds = extractInstanceIdsFromReservations(
        pageableToCollection(requester, {}, 'NextToken', 'Reservations')
    )
    return instanceIds
}
