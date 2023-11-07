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
import { Timeout } from '../utilities/timeoutUtils'
import { showMessageWithCancel } from '../utilities/messages'
import { ToolkitError, isAwsError } from '../errors'

export interface Ec2Instance extends EC2.Instance {
    name?: string
    status?: EC2.InstanceStateName
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
        const extractedInstances = this.getInstancesFromReservations(collection)
        const instances = await this.updateInstancesDetail(extractedInstances)

        return instances
    }

    /** Updates status and name in-place for displaying to humans. */
    protected async updateInstancesDetail(
        instances: AsyncCollection<EC2.Instance>
    ): Promise<AsyncCollection<EC2.Instance>> {
        return instances
            .map(async instance => {
                return { ...instance, status: await this.getInstanceStatus(instance.InstanceId!) }
            })
            .map(instance => {
                return instanceHasName(instance!)
                    ? { ...instance, name: lookupTagKey(instance!.Tags!, 'Name') }
                    : instance!
            })
    }

    public getInstancesFromReservations(
        reservations: AsyncCollection<EC2.ReservationList | undefined>
    ): AsyncCollection<EC2.Instance> {
        return reservations
            .flatten()
            .map(instanceList => instanceList?.Instances)
            .flatten()
            .filter(instance => instance!.InstanceId !== undefined)
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
        return status === 'running'
    }

    public getInstancesFilter(instanceIds: string[]): EC2.Filter[] {
        return [
            {
                Name: 'instance-id',
                Values: instanceIds,
            },
        ]
    }

    private handleStatusError(instanceId: string, err: unknown) {
        if (isAwsError(err)) {
            throw new ToolkitError(`EC2: failed to change status of instance ${instanceId}`, {
                cause: err as Error,
            })
        } else {
            throw err
        }
    }

    public async ensureInstanceNotInStatus(instanceId: string, targetStatus: string) {
        const isAlreadyInStatus = (await this.getInstanceStatus(instanceId)) === targetStatus
        if (isAlreadyInStatus) {
            throw new ToolkitError(
                `EC2: Instance is currently ${targetStatus}. Unable to update status of ${instanceId}.`
            )
        }
    }

    public async startInstance(instanceId: string): Promise<PromiseResult<EC2.StartInstancesResult, AWSError>> {
        const client = await this.createSdkClient()

        const response = await client.startInstances({ InstanceIds: [instanceId] }).promise()

        return response
    }

    public async startInstanceWithCancel(instanceId: string): Promise<void> {
        const timeout = new Timeout(5000)

        await showMessageWithCancel(`EC2: Starting instance ${instanceId}`, timeout)

        try {
            await this.ensureInstanceNotInStatus(instanceId, 'running')
            await this.startInstance(instanceId)
        } catch (err) {
            this.handleStatusError(instanceId, err)
        } finally {
            timeout.cancel()
        }
    }

    public async stopInstance(instanceId: string): Promise<PromiseResult<EC2.StopInstancesResult, AWSError>> {
        const client = await this.createSdkClient()

        const response = await client.stopInstances({ InstanceIds: [instanceId] }).promise()

        return response
    }

    public async stopInstanceWithCancel(instanceId: string): Promise<void> {
        const timeout = new Timeout(5000)

        await showMessageWithCancel(`EC2: Stopping instance ${instanceId}`, timeout)

        try {
            await this.ensureInstanceNotInStatus(instanceId, 'stopped')
            await this.stopInstance(instanceId)
        } catch (err) {
            this.handleStatusError(instanceId, err)
        } finally {
            timeout.cancel()
        }
    }

    public async rebootInstance(instanceId: string): Promise<void> {
        const client = await this.createSdkClient()

        await client.rebootInstances({ InstanceIds: [instanceId] }).promise()
    }

    public async rebootInstanceWithCancel(instanceId: string): Promise<void> {
        const timeout = new Timeout(5000)

        await showMessageWithCancel(`EC2: Rebooting instance ${instanceId}`, timeout)

        try {
            await this.rebootInstance(instanceId)
        } catch (err) {
            this.handleStatusError(instanceId, err)
        } finally {
            timeout.cancel()
        }
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
     * Gets the IAM Instance Profile (not role) attached to given EC2 instance.
     * @param instanceId target EC2 instance ID
     * @returns IAM Instance Profile associated with instance or undefined if none exists.
     */
    public async getAttachedIamInstanceProfile(instanceId: string): Promise<IamInstanceProfile | undefined> {
        const association = await this.getIamInstanceProfileAssociation(instanceId)
        return association ? association.IamInstanceProfile : undefined
    }
}

export function getNameOfInstance(instance: EC2.Instance): string | undefined {
    return instanceHasName(instance) ? lookupTagKey(instance.Tags!, 'Name')! : undefined
}

export function instanceHasName(instance: EC2.Instance): boolean {
    return instance.Tags !== undefined && instance.Tags.filter(tag => tag.Key === 'Name').length !== 0
}

function lookupTagKey(tags: EC2.Tag[], targetKey: string) {
    return tags.filter(tag => tag.Key === targetKey)[0].Value
}
