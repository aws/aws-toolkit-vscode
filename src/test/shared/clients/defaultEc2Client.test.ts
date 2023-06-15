/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AsyncCollection } from '../../../shared/utilities/asyncCollection'
import { EC2 } from 'aws-sdk'
import { toCollection } from '../../../shared/utilities/asyncCollection'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { DefaultEc2Client } from '../../../shared/clients/ec2Client'

describe('extractInstanceIdsFromReservations', function () {
    const client = new DefaultEc2Client('')
    it('returns empty when given empty collection', async function () {
        const actualResult = await client.extractInstanceIdsFromReservations(
            toCollection(async function* () { yield [] }
        ) as AsyncCollection<EC2.ReservationList>).promise()
        
        assert.strictEqual(0, actualResult.length)

    })

    it('flattens the reservationList', async function () {
        const testReservationsList: EC2.ReservationList = [
            {
                Instances: [
                    {
                        InstanceId: "id1"
                    },
                    {
                        InstanceId: "id2"
                    }
                ]
            }, 
            {
                Instances: [
                    {
                        InstanceId: "id3"
                    },
                    {
                        InstanceId: "id4"
                    }
                ]
            }
        ]
        const actualResult = await client.extractInstanceIdsFromReservations(intoCollection([testReservationsList])).promise()
        assert.deepStrictEqual(['id1', 'id2', 'id3', 'id4'], actualResult)
    }), 
    // Unsure if this test case is needed, but the return type in the SDK makes it possible these are unknown/not returned. 
    it('handles undefined and missing pieces in the ReservationList.', async function () {
        const testReservationsList: EC2.ReservationList = [
            {
                Instances: [
                    {
                        InstanceId: "id1"
                    },
                    {
                        InstanceId: undefined
                    }
                ]
            }, 
            {
                Instances: [
                    {
                        InstanceId: "id3"
                    },
                    {
                    }
                ]
            }, 
            
        ]
        const actualResult = await client.extractInstanceIdsFromReservations(intoCollection([testReservationsList])).promise()
        assert.deepStrictEqual(['id1', 'id3'], actualResult)
    })

})
