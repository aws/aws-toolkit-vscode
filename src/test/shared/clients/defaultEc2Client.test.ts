/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AsyncCollection } from '../../../shared/utilities/asyncCollection'
import { toCollection } from '../../../shared/utilities/asyncCollection'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { Ec2Client } from '../../../shared/clients/ec2Client'
import { Filter, Reservation } from '@aws-sdk/client-ec2'

describe('extractInstancesFromReservations', function () {
    const client = new Ec2Client('')
    it('returns empty when given empty collection', async function () {
        const actualResult = await client
            .extractInstancesFromReservations(
                toCollection(async function* () {
                    yield []
                }) as AsyncCollection<Reservation[]>
            )
            .promise()

        assert.strictEqual(0, actualResult.length)
    })

    it('flattens the reservationList', async function () {
        const testReservationsList: Reservation[] = [
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
        const actualResult = await client
            .extractInstancesFromReservations(intoCollection([testReservationsList]))
            .promise()
        assert.deepStrictEqual(
            [
                {
                    InstanceId: 'id1',
                    Tags: [{ Key: 'Name', Value: 'name1' }],
                },
                {
                    InstanceId: 'id2',
                    Tags: [{ Key: 'Name', Value: 'name2' }],
                },
                {
                    InstanceId: 'id3',
                    Tags: [{ Key: 'Name', Value: 'name3' }],
                },
                {
                    InstanceId: 'id4',
                    Tags: [{ Key: 'Name', Value: 'name4' }],
                },
            ],
            actualResult
        )
    }),
        // Unsure if this test case is needed, but the return type in the SDK makes it possible these are unknown/not returned.
        it('handles undefined and missing pieces in the ReservationList.', async function () {
            const testReservationsList: Reservation[] = [
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
                .extractInstancesFromReservations(intoCollection([testReservationsList]))
                .promise()
            assert.deepStrictEqual(
                [
                    { InstanceId: 'id1' },
                    {
                        InstanceId: 'id3',
                        Tags: [{ Key: 'Name', Value: 'name3' }],
                    },
                ],
                actualResult
            )
        })
})

describe('getSingleInstanceFilter', function () {
    const client = new Ec2Client('')

    it('returns proper filter when given instanceId', function () {
        const testInstanceId = 'test'
        const actualFilters = client.getSingleInstanceFilter(testInstanceId)
        const expectedFilters: Filter[] = [
            {
                Name: 'instance-id',
                Values: ['test'],
            },
        ]
        // CHANGE
        assert.deepStrictEqual(expectedFilters, actualFilters)
    })
})
