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
    Instance,
} from '@aws-sdk/client-ec2'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { IamInstanceProfile } from 'aws-sdk/clients/ec2'

export class Ec2Client {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<EC2> {
        return new EC2({ region: this.regionCode })
    }

    public async getInstances(filters?: Filter[]): Promise<AsyncCollection<Instance>> {
        const client = await this.createSdkClient()

        const requester = async (request: DescribeInstancesRequest) => client.describeInstances(request)
        const collection = filters
            ? pageableToCollection(requester, { Filters: filters }, 'NextToken', 'Reservations')
            : pageableToCollection(requester, {}, 'NextToken', 'Reservations')
        const instances = this.extractInstancesFromReservations(collection)
        return instances
    }

    public extractInstancesFromReservations(
        reservations: AsyncCollection<Reservation[] | undefined>
    ): AsyncCollection<Instance> {
        return reservations
            .flatten()
            .map(instanceList => instanceList?.Instances)
            .flatten()
            .filter(instance => instance!.InstanceId !== undefined)
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

    public getInstancesFilter(instanceIds: string[]): Filter[] {
        return [
            {
                Name: 'instance-id',
                Values: instanceIds,
            },
        ]
    }

    /**
     * Retrieve launch time of given EC2 instance.
     * @param instanceId target EC2 instance ID
     * @returns Date object for launch time associated with instance, or undefined if instance doesn't exists or doesn't have one.
     */
    public async getInstanceLaunchTime(instanceId: string): Promise<Date | undefined> {
        const singleInstanceFilter = this.getInstancesFilter([instanceId])
        try {
            const instance = (await (await this.getInstances(singleInstanceFilter)).promise())[0]
            return instance.LaunchTime!
        } catch (err: unknown) {
            return undefined
        }
    }

    /**
     * Retrieve IAM role attached to given EC2 instance.
     * @param instanceId target EC2 instance ID
     * @returns IAM role associated with instance, or undefined if none exists.
     */
    public async getAttachedIamRole(instanceId: string): Promise<IamInstanceProfile | undefined> {
        const client = await this.createSdkClient()
        const instanceFilter = this.getInstancesFilter([instanceId])
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

export function getNameOfInstance(instance: Instance): string | undefined {
    return instance.Tags ? lookupTagKey(instance.Tags, 'Name') : undefined
}

function lookupTagKey(tags: Tag[], targetKey: string) {
    return tags.filter(tag => tag.Key == targetKey)[0].Value
}
