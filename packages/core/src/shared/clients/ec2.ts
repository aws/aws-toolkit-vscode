/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    EC2Client,
    Instance,
    InstanceStateName,
    GetConsoleOutputRequest,
    Filter,
    paginateDescribeInstances,
    DescribeInstancesRequest,
    Reservation,
    Tag,
    paginateDescribeInstanceStatus,
    StartInstancesCommandOutput,
    StartInstancesCommand,
    StopInstancesCommand,
    StopInstancesCommandOutput,
    RebootInstancesCommand,
    IamInstanceProfileAssociation,
    paginateDescribeIamInstanceProfileAssociations,
    IamInstanceProfile,
    GetConsoleOutputCommand,
} from '@aws-sdk/client-ec2'
import { Timeout } from '../utilities/timeoutUtils'
import { showMessageWithCancel } from '../utilities/messages'
import { ToolkitError, isAwsError } from '../errors'
import { decodeBase64 } from '../utilities/textUtilities'
import { ClientWrapper } from './clientWrapper'

/**
 * A wrapper around EC2.Instance where we can safely assume InstanceId field exists.
 */
export interface SafeEc2Instance extends Instance {
    InstanceId: string
    Name?: string
    LastSeenStatus: InstanceStateName
}

interface SafeEc2GetConsoleOutputResult extends GetConsoleOutputRequest {
    Output: string
    InstanceId: string
}

export class Ec2Client extends ClientWrapper<EC2Client> {
    public constructor(public override readonly regionCode: string) {
        super(regionCode, EC2Client)
    }

    public async getInstances(filters?: Filter[]): Promise<SafeEc2Instance[]> {
        const reservations = await this.makePaginatedRequest(
            paginateDescribeInstances,
            filters ? { Filters: filters } : ({} satisfies DescribeInstancesRequest),
            (page) => page.Reservations
        )

        return await this.updateInstancesDetail(this.getInstancesFromReservations(reservations))
    }

    /** Updates status and name in-place for displaying to humans. */
    public async updateInstancesDetail(
        instances: Instance[],
        getStatus: (i: string) => Promise<InstanceStateName> = this.getInstanceStatus.bind(this)
    ): Promise<SafeEc2Instance[]> {
        const instanceWithId = instances.filter(hasId)
        const instanceWithStatus = await Promise.all(instanceWithId.map(addStatus))
        return instanceWithStatus.map((i) => (instanceHasName(i) ? { ...i, Name: lookupTagKey(i.Tags, 'Name') } : i))

        function hasId(i: Instance): i is Instance & { InstanceId: string } {
            return i.InstanceId !== undefined
        }

        async function addStatus(instance: Instance & { InstanceId: string }) {
            return { ...instance, LastSeenStatus: await getStatus(instance.InstanceId) }
        }
    }

    public getInstancesFromReservations(reservations: Reservation[]): (Instance & { InstanceId: string })[] {
        return reservations
            .map((r) => r.Instances)
            .flat()
            .filter(isNotEmpty)

        function isNotEmpty(i: Instance | undefined): i is Instance & { InstanceId: string } {
            return i !== undefined && i.InstanceId !== undefined
        }
    }

    public async getInstanceStatus(instanceId: string): Promise<InstanceStateName> {
        const instanceStatuses = await this.makePaginatedRequest(
            paginateDescribeInstanceStatus,
            { InstanceIds: [instanceId], IncludeAllInstances: true },
            (page) => page.InstanceStatuses
        )

        return instanceStatuses[0].InstanceState!.Name!
    }

    public async isInstanceRunning(instanceId: string): Promise<boolean> {
        const status = await this.getInstanceStatus(instanceId)
        return status === 'running'
    }

    public getInstancesFilter(instanceIds: string[]): Filter[] {
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

    public async assertNotInStatus(
        instanceId: string,
        targetStatus: string,
        getStatus: (i: string) => Promise<InstanceStateName> = this.getInstanceStatus.bind(this)
    ) {
        const isAlreadyInStatus = (await getStatus(instanceId)) === targetStatus
        if (isAlreadyInStatus) {
            throw new ToolkitError(
                `EC2: Instance is currently ${targetStatus}. Unable to update status of ${instanceId}.`
            )
        }
    }

    public async startInstance(instanceId: string): Promise<StartInstancesCommandOutput> {
        return await this.makeRequest(StartInstancesCommand, { InstanceIds: [instanceId] })
    }

    public async startInstanceWithCancel(instanceId: string): Promise<void> {
        const timeout = new Timeout(5000)

        await showMessageWithCancel(`EC2: Starting instance ${instanceId}`, timeout)

        try {
            await this.assertNotInStatus(instanceId, 'running')
            await this.startInstance(instanceId)
        } catch (err) {
            this.handleStatusError(instanceId, err)
        } finally {
            timeout.cancel()
        }
    }

    public async stopInstance(instanceId: string): Promise<StopInstancesCommandOutput> {
        return await this.makeRequest(StopInstancesCommand, { InstanceIds: [instanceId] })
    }

    public async stopInstanceWithCancel(instanceId: string): Promise<void> {
        const timeout = new Timeout(5000)

        await showMessageWithCancel(`EC2: Stopping instance ${instanceId}`, timeout)

        try {
            await this.assertNotInStatus(instanceId, 'stopped')
            await this.stopInstance(instanceId)
        } catch (err) {
            this.handleStatusError(instanceId, err)
        } finally {
            timeout.cancel()
        }
    }

    public async rebootInstance(instanceId: string): Promise<void> {
        return await this.makeRequest(RebootInstancesCommand, { InstanceIds: [instanceId] })
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
    private async getIamInstanceProfileAssociation(instanceId: string): Promise<IamInstanceProfileAssociation> {
        const instanceFilter = this.getInstancesFilter([instanceId])

        const associations = await this.makePaginatedRequest(
            paginateDescribeIamInstanceProfileAssociations,
            { Filters: instanceFilter },
            (page) => page.IamInstanceProfileAssociations
        )

        return associations[0]!
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

    public async getConsoleOutput(instanceId: string, latest: boolean): Promise<SafeEc2GetConsoleOutputResult> {
        const response = await this.makeRequest(GetConsoleOutputCommand, { InstanceId: instanceId, Latest: latest })

        return {
            ...response,
            InstanceId: instanceId,
            Output: response.Output ? decodeBase64(response.Output) : '',
        }
    }
}

export function getNameOfInstance(instance: Instance): string | undefined {
    return instanceHasName(instance) ? lookupTagKey(instance.Tags!, 'Name')! : undefined
}

export function instanceHasName(instance: Instance): instance is Instance & { Tags: Tag[] } {
    return instance.Tags !== undefined && instance.Tags.some((tag) => tag.Key === 'Name')
}

function lookupTagKey(tags: Tag[], targetKey: string) {
    return tags.filter((tag) => tag.Key === targetKey)[0].Value
}
