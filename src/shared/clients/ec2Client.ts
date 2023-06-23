/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    EC2,
    DescribeInstancesRequest,
    DescribeIamInstanceProfileAssociationsRequest,
    Filter,
    Reservation,
    DescribeInstanceStatusRequest,
    InstanceStateName,
    Tag,
} from '@aws-sdk/client-ec2'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { IamInstanceProfile } from 'aws-sdk/clients/ec2'

export interface Ec2Instance {
    instanceId: string
    name?: string
    launchTime?: Date
}

export class Ec2Client {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<EC2> {
        return new EC2({ region: this.regionCode })
    }
    public async getInstances(): Promise<AsyncCollection<Ec2Instance>> {
        const client = await this.createSdkClient()
        const requester = async (request: DescribeInstancesRequest) => client.describeInstances(request)
        const collection = pageableToCollection(requester, {}, 'NextToken', 'Reservations')
        const instances = this.extractInstancesFromReservations(collection)
        return instances
    }

    private lookupTagKey(tags: Tag[], targetKey: string): string | undefined {
        return tags.filter(tag => tag.Key == targetKey)[0].Value
    }

    public extractInstancesFromReservations(
        reservations: AsyncCollection<Reservation[] | undefined>
    ): AsyncCollection<Ec2Instance> {
        return reservations
            .flatten()
            .map(instanceList => instanceList?.Instances)
            .flatten()
            .filter(instance => instance!.InstanceId !== undefined)
            .map(instance => {
                return {
                    instanceId: instance!.InstanceId!,
                    name: this.lookupTagKey(instance!.Tags!, 'Name'),
                    launchTime: instance!.LaunchTime!,
                }
            })
    }

    public async getInstanceStatus(instanceId: string): Promise<InstanceStateName> {
        const client = await this.createSdkClient()
        const requester = async (request: DescribeInstanceStatusRequest) => client.describeInstanceStatus(request)

        // Fix: SDK returns string instead of InstanceStateName so we have to cast it.
        const response: InstanceStateName[] = await pageableToCollection(
            requester,
            { InstanceIds: [instanceId], IncludeAllInstances: true },
            'NextToken',
            'InstanceStatuses'
        )
            .flatten()
            .map(instanceStatus => instanceStatus!.InstanceState!.Name! as InstanceStateName)
            .promise()

        return response[0]
    }

    public async isInstanceRunning(instanceId: string): Promise<boolean> {
        return await this.checkInstanceStatus(instanceId, 'running')
    }

    private async checkInstanceStatus(instanceId: string, targetStatus: InstanceStateName): Promise<boolean> {
        const status = await this.getInstanceStatus(instanceId)
        return status == targetStatus
    }

    private getSingleInstanceFilter(instanceId: string): Filter[] {
        return [
            {
                Name: 'instance-id',
                Values: [instanceId],
            },
        ]
    }

    /**
     * Retrieve IAM role attached to given EC2 instance.
     * @param instanceId target EC2 instance ID
     * @returns IAM role associated with instance, or undefined if none exists.
     */
    public async getAttachedIamRole(instanceId: string): Promise<IamInstanceProfile | undefined> {
        const client = await this.createSdkClient()
        const instanceFilter = this.getSingleInstanceFilter(instanceId)
        const requester = async (request: DescribeIamInstanceProfileAssociationsRequest) =>
            client.describeIamInstanceProfileAssociations(request)
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
