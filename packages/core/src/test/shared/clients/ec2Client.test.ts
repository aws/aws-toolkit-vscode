/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Ec2Client, instanceHasName, Ec2Reservation } from '../../../shared/clients/ec2'
import { Filter, InstanceStateName, Reservation } from '@aws-sdk/client-ec2'
import { intoCollection } from '../../../shared/utilities/collectionUtils'

const completeReservationsList: Reservation[] = [
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

const incompleteReservationsList: Reservation[] = [
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

const getStatus: (i: string) => Promise<InstanceStateName> = (i) =>
    new Promise((resolve) => {
        resolve(i.split('-')[0] as InstanceStateName)
    })

describe('updateInstancesDetail', async function () {
    let client: Ec2Client
    before(function () {
        client = new Ec2Client('test-region')
    })

    it('adds appropriate status and name field to the instance', async function () {
        const actualResult = await client
            .patchReservations(intoCollection([completeReservationsList]), getStatus)
            .promise()
        const expectedResult: Ec2Reservation[][] = [
            [
                {
                    Instances: [
                        {
                            InstanceId: 'running-1',
                            Name: 'name1',
                            Tags: [{ Key: 'Name', Value: 'name1' }],
                            LastSeenStatus: 'running',
                        },
                        {
                            InstanceId: 'stopped-2',
                            Name: 'name2',
                            Tags: [{ Key: 'Name', Value: 'name2' }],
                            LastSeenStatus: 'stopped',
                        },
                    ],
                },
                {
                    Instances: [
                        {
                            InstanceId: 'pending-3',
                            Tags: [{ Key: 'Name', Value: 'name3' }],
                            LastSeenStatus: 'pending',
                            Name: 'name3',
                        },
                        {
                            InstanceId: 'running-4',
                            Tags: [{ Key: 'Name', Value: 'name4' }],
                            Name: 'name4',
                            LastSeenStatus: 'running',
                        },
                    ],
                },
            ],
        ]

        assert.deepStrictEqual(actualResult, expectedResult)
    })

    it('handles incomplete and missing tag fields', async function () {
        const actualResult = await client
            .patchReservations(intoCollection([incompleteReservationsList]), getStatus)
            .promise()

        const expectedResult: Ec2Reservation[][] = [
            [
                {
                    Instances: [
                        {
                            InstanceId: 'running-1',
                            LastSeenStatus: 'running',
                        },
                        {
                            InstanceId: 'stopped-2',
                            LastSeenStatus: 'stopped',
                            Tags: [],
                        },
                    ],
                },
                {
                    Instances: [
                        {
                            InstanceId: 'pending-3',
                            Tags: [{ Key: 'Name', Value: 'name3' }],
                            LastSeenStatus: 'pending',
                            Name: 'name3',
                        },
                    ],
                },
            ],
        ]

        assert.deepStrictEqual(actualResult, expectedResult)
    })
})

describe('getInstancesFilter', function () {
    const client = new Ec2Client('')

    it('returns proper filter when given instanceId', function () {
        const testInstanceId1 = 'test'
        const actualFilters1 = client.getInstancesFilter([testInstanceId1])
        const expectedFilters1: Filter[] = [
            {
                Name: 'instance-id',
                Values: [testInstanceId1],
            },
        ]

        assert.deepStrictEqual(expectedFilters1, actualFilters1)

        const testInstanceId2 = 'test2'
        const actualFilters2 = client.getInstancesFilter([testInstanceId1, testInstanceId2])
        const expectedFilters2: Filter[] = [
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
        const client = new Ec2Client('test-region')

        await client.assertNotInStatus('stopped-instance', 'running', getStatus)

        try {
            await client.assertNotInStatus('running-instance', 'running', getStatus)
            assert.ok(false)
        } catch {}
    })
})
