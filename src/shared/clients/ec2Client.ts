/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSError, EC2 } from 'aws-sdk'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { IamInstanceProfile } from 'aws-sdk/clients/ec2'
import globals from '../extensionGlobals'
import { PromiseResult } from 'aws-sdk/lib/request'

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
        const collection = pageableToCollection(
            requester,
            filters ? { Filters: filters } : {},
            'NextToken',
            'Reservations'
        )
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
                return instanceHasName(instance!)
                    ? { ...instance, name: lookupTagKey(instance!.Tags!, 'Name') }
                    : instance!
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

    public async isInstanceRunning(instanceId: string): Promise<boolean> {
        const status = await this.getInstanceStatus(instanceId)
        return status == 'running'
    }

    public getInstancesFilter(instanceIds: string[]): EC2.Filter[] {
        return [
            {
                Name: 'instance-id',
                Values: instanceIds,
            },
        ]
    }

    public async startInstance(instanceId: string): Promise<PromiseResult<EC2.StartInstancesResult, AWSError>> {
        const client = await this.createSdkClient()

        const response = await client.startInstances({ InstanceIds: [instanceId] }).promise()

        return response
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
    return instanceHasName(instance) ? lookupTagKey(instance.Tags!, 'Name')! : undefined
}

export function instanceHasName(instance: EC2.Instance): boolean {
    return instance.Tags !== undefined && instance.Tags.filter(tag => tag.Key === 'Name').length != 0
}

function lookupTagKey(tags: EC2.Tag[], targetKey: string) {
    return tags.filter(tag => tag.Key === targetKey)[0].Value
}
