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
import { AsyncCollection } from '../utilities/asyncCollection'

/**
 * A wrapper around Instance where we can safely assume InstanceId field exists.
 */
export interface PatchedEc2Instance extends Instance {
    InstanceId: string
    Name?: string
    LastSeenStatus: InstanceStateName
}

export interface PatchedReservation extends Reservation {
    Instances: PatchedEc2Instance[]
}

interface InstanceWithId extends Instance {
    InstanceId: string
}

interface SafeEc2GetConsoleOutputResult extends GetConsoleOutputRequest {
    Output: string
    InstanceId: string
}

export class Ec2Client extends ClientWrapper<EC2Client> {
    public constructor(public override readonly regionCode: string) {
        super(regionCode, EC2Client)
    }

    public getReservations(filters?: Filter[]): AsyncCollection<PatchedReservation[]> {
        const reservations = this.makePaginatedRequest(
            paginateDescribeInstances,
            filters ? { Filters: filters } : ({} satisfies DescribeInstancesRequest),
            (page) => page.Reservations
        )

        return this.patchReservations(reservations)
    }

    public getInstances(filters?: Filter[]): AsyncCollection<PatchedEc2Instance[]> {
        return this.getReservations(filters)
            .flatten()
            .map((r) => r.Instances)
    }

    /** Updates status and name in-place for displaying to humans. */
    public patchReservations(
        reservationPages: AsyncCollection<Reservation[]>,
        getStatus: (i: string) => Promise<InstanceStateName> = this.getInstanceStatus.bind(this)
    ): AsyncCollection<PatchedReservation[]> {
        return reservationPages.map(async (r) => await Promise.all(r.filter(isNotEmpty).map(patchReservation)))

        async function patchReservation(r: Reservation & { Instances: Instance[] }): Promise<PatchedReservation> {
            const namedInstances = r.Instances.filter(hasId).map(addName)
            return { ...r, Instances: await Promise.all(namedInstances.map(addStatus)) } satisfies Reservation
        }

        function hasId(i: Instance): i is InstanceWithId {
            return i.InstanceId !== undefined
        }

        function addName<I extends InstanceWithId>(i: I): I & { Name?: string } {
            return instanceHasName(i) ? { ...i, Name: lookupTagKey(i.Tags, 'Name') } : i
        }

        async function addStatus<I extends InstanceWithId>(
            instance: I
        ): Promise<I & { LastSeenStatus: InstanceStateName }> {
            return { ...instance, LastSeenStatus: await getStatus(instance.InstanceId) }
        }

        function isNotEmpty(r: Reservation): r is Reservation & { Instances: Instance[] } {
            return r.Instances !== undefined && r.Instances.length > 0
        }
    }

    public async getInstanceStatus(instanceId: string): Promise<InstanceStateName> {
        const instanceStatuses = await this.makePaginatedRequest(
            paginateDescribeInstanceStatus,
            { InstanceIds: [instanceId], IncludeAllInstances: true },
            (page) => page.InstanceStatuses
        )
            .flatten()
            .promise()

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
            .flatten()
            .promise()

        return associations[0]
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
