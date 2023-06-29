/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2 } from 'aws-sdk'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { IamInstanceProfile } from 'aws-sdk/clients/ec2'
import globals from '../extensionGlobals'

export interface Ec2Instance {
    instanceId: string
    name?: string
}

export class Ec2Client {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<EC2> {
        return await globals.sdkClientBuilder.createAwsService(EC2, undefined, this.regionCode)
    }
    public async getInstances(): Promise<AsyncCollection<Ec2Instance>> {
        const client = await this.createSdkClient()
        const requester = async (request: EC2.DescribeInstancesRequest) => client.describeInstances(request).promise()
        const collection = pageableToCollection(requester, {}, 'NextToken', 'Reservations')
        const instances = this.extractInstancesFromReservations(collection)
        return instances
    }

    private lookupTagKey(tags: EC2.Tag[], targetKey: string): string | undefined {
        return tags.filter(tag => tag.Key == targetKey)[0].Value
    }

    public getInstancesFromReservations(
        reservations: AsyncCollection<EC2.ReservationList | undefined>
    ): AsyncCollection<Ec2Instance> {
        return reservations
            .flatten()
            .map(instanceList => instanceList?.Instances)
            .flatten()
            .filter(instance => instance!.InstanceId !== undefined)
            .map(instance => {
                return instance!.Tags
                    ? { instanceId: instance!.InstanceId!, name: this.lookupTagKey(instance!.Tags!, 'Name') }
                    : { instanceId: instance!.InstanceId! }
            })
    }

    public async getInstanceStatus(instanceId: string): Promise<EC2.InstanceStateName> {
        const client = await this.createSdkClient()
        const requester = async (request: EC2.DescribeInstanceStatusRequest) =>
            client.describeInstanceStatus(request).promise()

        const response = await pageableToCollection(
            requester,
            { InstanceIds: [instanceId], IncludeAllInstances: true },
            'NextToken',
            'InstanceStatuses'
        )
            .flatten()
            .map(instanceStatus => instanceStatus!.InstanceState!.Name!)
            .promise()

        return response[0]
    }

    /**
     * Retrieve IAM role attached to given EC2 instance.
     * @param instanceId target EC2 instance ID
     * @returns IAM role associated with instance, or undefined if none exists.
     */
    public async getAttachedIamRole(instanceId: string): Promise<IamInstanceProfile | undefined> {
        const client = await this.createSdkClient()
        const instanceFilter: EC2.Filter[] = [
            {
                Name: 'instance-id',
                Values: [instanceId],
            },
        ]
        const requester = async (request: EC2.DescribeIamInstanceProfileAssociationsRequest) =>
            client.describeIamInstanceProfileAssociations(request).promise()
        const response = await pageableToCollection(
            requester,
            { Filters: instanceFilter },
            'NextToken',
            'IamInstanceProfileAssociations'
        )
            .flatten()
            .map(val => val?.IamInstanceProfile)
            .promise()

        return response && response.length ? response[0] : undefined
    }
}
