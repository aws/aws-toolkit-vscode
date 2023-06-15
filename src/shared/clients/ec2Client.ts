/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2 } from "aws-sdk"
import globals from "../extensionGlobals"
import { AsyncCollection } from "../utilities/asyncCollection"
import { extractInstanceIdsFromReservations } from "../../ec2/utils"
import { pageableToCollection } from "../utilities/collectionUtils"

export class DefaultEc2Client {
    public constructor(public readonly regionCode: string){}

    private async createSdkClient(): Promise<EC2> {
        return await globals.sdkClientBuilder.createAwsService(EC2, undefined, this.regionCode)
    }
    public async getInstanceIds(): Promise<AsyncCollection<string>> {
        const client = await this.createSdkClient()
        const requester = async (request: EC2.DescribeInstancesRequest) => client.describeInstances(request).promise()
    
        const instanceIds = extractInstanceIdsFromReservations(
            pageableToCollection(requester, {}, 'NextToken', 'Reservations')
        )
        return instanceIds
    }
}
