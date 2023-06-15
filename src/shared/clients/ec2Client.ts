/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2 } from "aws-sdk"
import globals from "../extensionGlobals"
import { AsyncCollection } from "../utilities/asyncCollection"
import { pageableToCollection } from "../utilities/collectionUtils"

export class DefaultEc2Client {
    public constructor(public readonly regionCode: string){}

    private async createSdkClient(): Promise<EC2> {
        return await globals.sdkClientBuilder.createAwsService(EC2, undefined, this.regionCode)
    }
    public async getInstanceIds(): Promise<AsyncCollection<string>> {
        const client = await this.createSdkClient()
        const requester = async (request: EC2.DescribeInstancesRequest) => client.describeInstances(request).promise()
    
        const instanceIds = this.extractInstanceIdsFromReservations(
            pageableToCollection(requester, {}, 'NextToken', 'Reservations')
        )
        return instanceIds
    }

    public extractInstanceIdsFromReservations(
        reservations: AsyncCollection<EC2.ReservationList | undefined>
    ): AsyncCollection<string> {
        return reservations
            .flatten()
            .map(instanceList => instanceList?.Instances)
            .flatten()
            .map(instance => instance?.InstanceId)
            .filter(instanceId => instanceId !== undefined)
    }
}
