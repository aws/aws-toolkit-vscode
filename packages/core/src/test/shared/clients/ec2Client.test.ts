/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AsyncCollection } from '../../../shared/utilities/asyncCollection'
import { toCollection } from '../../../shared/utilities/asyncCollection'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { Ec2Client, instanceHasName } from '../../../shared/clients/ec2Client'
import { EC2 } from 'aws-sdk'

class MockEc2Client extends Ec2Client {
    public override async getInstanceStatus(instanceId: string): Promise<string> {
        return instanceId.split('-')[0]
    }

    public async testUpdateInstancesDetail(instances: EC2.Instance[]) {
        return await (await this.updateInstancesDetail(intoCollection(instances))).promise()
    }
}

const completeReservationsList: EC2.ReservationList = [
    {
        Instances: [
            {
                InstanceId: 'running-1',
                Tags: [{ Key: 'Name', Value: 'name1' }],
            },
            {
                InstanceId: 'stopped-2',
                Tags: [{ Key: 'Name', Value: 'name2' }],
            },
        ],
    },
    {
        Instances: [
            {
                InstanceId: 'pending-3',
                Tags: [{ Key: 'Name', Value: 'name3' }],
            },
            {
                InstanceId: 'running-4',
                Tags: [{ Key: 'Name', Value: 'name4' }],
            },
        ],
    },
]

const completeInstanceList: EC2.InstanceList = [
    { InstanceId: 'running-1', Tags: [{ Key: 'Name', Value: 'name1' }] },
    { InstanceId: 'stopped-2', Tags: [{ Key: 'Name', Value: 'name2' }] },
    { InstanceId: 'pending-3', Tags: [{ Key: 'Name', Value: 'name3' }] },
    { InstanceId: 'running-4', Tags: [{ Key: 'Name', Value: 'name4' }] },
]

const incompleteReservationsList: EC2.ReservationList = [
    {
        Instances: [
            {
                InstanceId: 'running-1',
            },
            {
                InstanceId: 'stopped-2',
                Tags: [],
            },
        ],
    },
    {
        Instances: [
            {
                InstanceId: 'pending-3',
                Tags: [{ Key: 'Name', Value: 'name3' }],
            },
            {},
        ],
    },
]

const incomepleteInstanceList: EC2.InstanceList = [
    { InstanceId: 'running-1' },
    { InstanceId: 'stopped-2', Tags: [] },
    { InstanceId: 'pending-3', Tags: [{ Key: 'Name', Value: 'name3' }] },
]

describe('extractInstancesFromReservations', function () {
    const client = new Ec2Client('')

    it('returns empty when given empty collection', async function () {
        const actualResult = await client
            .getInstancesFromReservations(
                toCollection(async function* () {
                    yield []
                }) as AsyncCollection<EC2.ReservationList>
            )
            .promise()

        assert.strictEqual(0, actualResult.length)
    })

    it('flattens the reservationList', async function () {
        const actualResult = await client
            .getInstancesFromReservations(intoCollection([completeReservationsList]))
            .promise()
        assert.deepStrictEqual(actualResult, completeInstanceList)
    })

    it('handles undefined and missing pieces in the ReservationList.', async function () {
        const actualResult = await client
            .getInstancesFromReservations(intoCollection([incompleteReservationsList]))
            .promise()
        assert.deepStrictEqual(actualResult, incomepleteInstanceList)
    })
})

describe('updateInstancesDetail', async function () {
    let client: MockEc2Client

    before(function () {
        client = new MockEc2Client('test-region')
    })

    it('adds appropriate status and name field to the instance', async function () {
        const actualResult = await client.testUpdateInstancesDetail(completeInstanceList)
        const expectedResult = [
            { InstanceId: 'running-1', name: 'name1', status: 'running', Tags: [{ Key: 'Name', Value: 'name1' }] },
            { InstanceId: 'stopped-2', name: 'name2', status: 'stopped', Tags: [{ Key: 'Name', Value: 'name2' }] },
            { InstanceId: 'pending-3', name: 'name3', status: 'pending', Tags: [{ Key: 'Name', Value: 'name3' }] },
            { InstanceId: 'running-4', name: 'name4', status: 'running', Tags: [{ Key: 'Name', Value: 'name4' }] },
        ]

        assert.deepStrictEqual(actualResult, expectedResult)
    })

    it('handles incomplete and missing tag fields', async function () {
        const actualResult = await client.testUpdateInstancesDetail(incomepleteInstanceList)

        const expectedResult = [
            { InstanceId: 'running-1', status: 'running' },
            { InstanceId: 'stopped-2', status: 'stopped', Tags: [] },
            { InstanceId: 'pending-3', status: 'pending', name: 'name3', Tags: [{ Key: 'Name', Value: 'name3' }] },
        ]

        assert.deepStrictEqual(actualResult, expectedResult)
    })
})

describe('getInstancesFilter', function () {
    const client = new Ec2Client('')

    it('returns proper filter when given instanceId', function () {
        const testInstanceId1 = 'test'
        const actualFilters1 = client.getInstancesFilter([testInstanceId1])
        const expectedFilters1: EC2.Filter[] = [
            {
                Name: 'instance-id',
                Values: [testInstanceId1],
            },
        ]

        assert.deepStrictEqual(expectedFilters1, actualFilters1)

        const testInstanceId2 = 'test2'
        const actualFilters2 = client.getInstancesFilter([testInstanceId1, testInstanceId2])
        const expectedFilters2: EC2.Filter[] = [
            {
                Name: 'instance-id',
                Values: [testInstanceId1, testInstanceId2],
            },
        ]

        assert.deepStrictEqual(expectedFilters2, actualFilters2)
    })
})

describe('instanceHasName', function () {
    it('returns whether or not there is name attached to instance', function () {
        const instances = [
            { InstanceId: 'id1', Tags: [] },
            { InstanceId: 'id2', name: 'name2', Tags: [{ Key: 'Name', Value: 'name2' }] },
            { InstanceId: 'id3', Tags: [{ Key: 'NotName', Value: 'notAName' }] },
            {
                InstanceId: 'id4',
                name: 'name4',
                Tags: [
                    { Key: 'Name', Value: 'name4' },
                    { Key: 'anotherKey', Value: 'Another Key' },
                ],
            },
        ]

        assert.deepStrictEqual(false, instanceHasName(instances[0]))
        assert.deepStrictEqual(true, instanceHasName(instances[1]))
        assert.deepStrictEqual(false, instanceHasName(instances[2]))
        assert.deepStrictEqual(true, instanceHasName(instances[3]))
    })
})

describe('ensureInstanceNotInStatus', async function () {
    it('only throws error if instance is in status', async function () {
        const client = new MockEc2Client('test-region')

        await client.ensureInstanceNotInStatus('stopped-instance', 'running')

        try {
            await client.ensureInstanceNotInStatus('running-instance', 'running')
            assert.ok(false)
        } catch {}
    })
})
