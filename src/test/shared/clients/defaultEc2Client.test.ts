/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AsyncCollection } from '../../../shared/utilities/asyncCollection'
import { toCollection } from '../../../shared/utilities/asyncCollection'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { Ec2Client, instanceHasName } from '../../../shared/clients/ec2Client'
import { EC2 } from 'aws-sdk'

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
        const testReservationsList: EC2.ReservationList = [
            {
                Instances: [
                    {
                        InstanceId: 'id1',
                        Tags: [{ Key: 'Name', Value: 'name1' }],
                    },
                    {
                        InstanceId: 'id2',
                        Tags: [{ Key: 'Name', Value: 'name2' }],
                    },
                ],
            },
            {
                Instances: [
                    {
                        InstanceId: 'id3',
                        Tags: [{ Key: 'Name', Value: 'name3' }],
                    },
                    {
                        InstanceId: 'id4',
                        Tags: [{ Key: 'Name', Value: 'name4' }],
                    },
                ],
            },
        ]
        const actualResult = await client.getInstancesFromReservations(intoCollection([testReservationsList])).promise()
        assert.deepStrictEqual(
            [
                { InstanceId: 'id1', name: 'name1', Tags: [{ Key: 'Name', Value: 'name1' }] },
                { InstanceId: 'id2', name: 'name2', Tags: [{ Key: 'Name', Value: 'name2' }] },
                { InstanceId: 'id3', name: 'name3', Tags: [{ Key: 'Name', Value: 'name3' }] },
                { InstanceId: 'id4', name: 'name4', Tags: [{ Key: 'Name', Value: 'name4' }] },
            ],
            actualResult
        )
    }),
        // Unsure if this test case is needed, but the return type in the SDK makes it possible these are unknown/not returned.
        it('handles undefined and missing pieces in the ReservationList.', async function () {
            const testReservationsList: EC2.ReservationList = [
                {
                    Instances: [
                        {
                            InstanceId: 'id1',
                        },
                        {
                            InstanceId: undefined,
                        },
                    ],
                },
                {
                    Instances: [
                        {
                            InstanceId: 'id3',
                            Tags: [{ Key: 'Name', Value: 'name3' }],
                        },
                        {},
                    ],
                },
            ]
            const actualResult = await client
                .getInstancesFromReservations(intoCollection([testReservationsList]))
                .promise()
            assert.deepStrictEqual(
                [{ InstanceId: 'id1' }, { InstanceId: 'id3', name: 'name3', Tags: [{ Key: 'Name', Value: 'name3' }] }],
                actualResult
            )
        })

    it('can process results without complete Tag field.', async function () {
        const testReservationsList: EC2.ReservationList = [
            {
                Instances: [
                    {
                        InstanceId: 'id1',
                        Tags: [{ Key: 'Name', Value: 'name1' }],
                    },
                    {
                        InstanceId: 'id2',
                    },
                ],
            },
            {
                Instances: [
                    {
                        InstanceId: 'id3',
                        Tags: [{ Key: 'Name', Value: 'name3' }],
                    },
                    {
                        InstanceId: 'id4',
                        Tags: [],
                    },
                ],
            },
        ]

        const actualResult = await client.getInstancesFromReservations(intoCollection([testReservationsList])).promise()

        assert.deepStrictEqual(
            [
                { InstanceId: 'id1', name: 'name1', Tags: [{ Key: 'Name', Value: 'name1' }] },
                { InstanceId: 'id2' },
                { InstanceId: 'id3', name: 'name3', Tags: [{ Key: 'Name', Value: 'name3' }] },
                { InstanceId: 'id4', Tags: [] },
            ],
            actualResult
        )
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
    it('correctly returns whether or not there is name attached to instance.', function () {
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

describe('getSingleInstanceFilter', function () {
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
