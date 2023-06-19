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
} from '@aws-sdk/client-ec2'
import { AsyncCollection } from '../utilities/asyncCollection'
import { pageableToCollection } from '../utilities/collectionUtils'
import { IamInstanceProfile } from 'aws-sdk/clients/ec2'

export class DefaultEc2Client {
    public constructor(public readonly regionCode: string) {}

    private async createSdkClient(): Promise<EC2> {
        return new EC2({ region: this.regionCode })
    }
    public async getInstanceIds(): Promise<AsyncCollection<string>> {
        const client = await this.createSdkClient()
        const requester = async (request: DescribeInstancesRequest) => client.describeInstances(request)
        const instanceIds = this.extractInstanceIdsFromReservations(
            pageableToCollection(requester, {}, 'NextToken', 'Reservations')
        )
        return instanceIds
    }

    public extractInstanceIdsFromReservations(
        reservations: AsyncCollection<Reservation[] | undefined>
    ): AsyncCollection<string> {
        return reservations
            .flatten()
            .map(instanceList => instanceList?.Instances)
            .flatten()
            .map(instance => instance?.InstanceId)
            .filter(instanceId => instanceId !== undefined)
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

    /**
     * Retrieve IAM role attached to given EC2 instance.
     * @param instanceId target EC2 instance ID
     * @returns IAM role associated with instance, or undefined if none exists.
     */
    public async getAttachedIamRole(instanceId: string): Promise<IamInstanceProfile | undefined> {
        const client = await this.createSdkClient()
        const instanceFilter: Filter[] = [
            {
                Name: 'instance-id',
                Values: [instanceId],
            },
        ]
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
