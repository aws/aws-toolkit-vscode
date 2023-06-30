/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2 } from 'aws-sdk'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { IamInstanceProfile } from 'aws-sdk/clients/ec2'
import globals from '../extensionGlobals'

export interface Ec2Instance extends EC2.Instance {
    name?: string
}

export class Ec2Client {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<EC2> {
        return await globals.sdkClientBuilder.createAwsService(EC2, undefined, this.regionCode)
    }

    public async getInstances(filters?: EC2.Filter[]): Promise<AsyncCollection<EC2.Instance>> {
        const client = await this.createSdkClient()

        const requester = async (request: EC2.DescribeInstancesRequest) => client.describeInstances(request).promise()
        const collection =pageableToCollection(requester, filters ? { Filters: filters } : {}, 'NextToken', 'Reservations')
        const instances = this.getInstancesFromReservations(collection)
        return instances
    }

    public getInstancesFromReservations(
        reservations: AsyncCollection<EC2.ReservationList | undefined>
    ): AsyncCollection<EC2.Instance> {
        return reservations
            .flatten()
            .map(instanceList => instanceList?.Instances)
            .flatten()
            .filter(instance => instance!.InstanceId !== undefined)
            .map(instance => {
                return instance!.Tags ? { ...instance, name: lookupTagKey(instance!.Tags!, 'Name') } : instance!
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

    public getInstancesFilter(instanceIds: string[]): EC2.Filter[] {
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
     * Retrieve association time for IAM role for a given EC2 instance.
     * @param instanceId target EC2 instance ID
     * @returns Date of most recent IAM associaton with given instance.
     */
    public async getIamAttachDate(instanceId: string): Promise<Date | undefined> {
        const roleAssociation = await this.getIamInstanceProfileAssociation(instanceId)
        return roleAssociation ? roleAssociation.Timestamp! : undefined
    }

    /**
     * Retrieve IAM Association for a given EC2 instance.
     * @param instanceId target EC2 instance ID
     * @returns IAM Association for instance
     */
    private async getIamInstanceProfileAssociation(instanceId: string): Promise<EC2.IamInstanceProfileAssociation> {
        const client = await this.createSdkClient()
        const instanceFilter = this.getInstancesFilter([instanceId])
        const requester = async (request: EC2.DescribeIamInstanceProfileAssociationsRequest) =>
            client.describeIamInstanceProfileAssociations(request).promise()
        const response = await pageableToCollection(
            requester,
            { Filters: instanceFilter },
            'NextToken',
            'IamInstanceProfileAssociations'
        )
            .flatten()
            .filter(association => association !== undefined)
            .promise()

        return response[0]!
    }

    /**
     * Retrieve IAM role attached to given EC2 instance.
     * @param instanceId target EC2 instance ID
     * @returns IAM role associated with instance or undefined if none exists.
     */
    public async getAttachedIamRole(instanceId: string): Promise<IamInstanceProfile | undefined> {
        const association = await this.getIamInstanceProfileAssociation(instanceId)
        return association ? association.IamInstanceProfile : undefined
    }
}

export function getNameOfInstance(instance: EC2.Instance): string | undefined {
    return instance.Tags ? lookupTagKey(instance.Tags, 'Name') : undefined
}

function lookupTagKey(tags: EC2.Tag[], targetKey: string) {
    return tags.filter(tag => tag.Key == targetKey)[0].Value
}
