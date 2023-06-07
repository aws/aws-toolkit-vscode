/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { validateRepositoryName } from '../../ecr/utils'
import { extractInstanceIdsFromReservations } from '../../ec2/utils'
import { AsyncCollection } from '../../shared/utilities/asyncCollection'
import { EC2 } from 'aws-sdk'
import { toCollection } from '../../shared/utilities/asyncCollection'

describe('extractInstanceIdsFromReservations', function () {
    it('returns empty when given empty collection', async function () {

        const actualResult = await extractInstanceIdsFromReservations(
            toCollection(async function* () { yield [] }
        ) as AsyncCollection<EC2.ReservationList>).promise()
        
        assert.strictEqual(0, actualResult.length)

    })

})
