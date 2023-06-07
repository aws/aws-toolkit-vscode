/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2 } from 'aws-sdk'
import globals from '../shared/extensionGlobals'
import { pageableToCollection } from '../shared/utilities/collectionUtils'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { extractInstanceIdsFromReservations } from "./utils"
import { selectInstance } from './prompter'

export async function attemptConnection(defaultRegion: string): Promise<void> {
    const client = await globals.sdkClientBuilder.createAwsService(EC2, undefined, defaultRegion)
            const requester = async (request: EC2.DescribeInstancesRequest) => 
                client.describeInstances(request).promise() 
            const collection = extractInstanceIdsFromReservations(pageableToCollection(requester, {}, 'NextToken', 'Reservations'))

            const selection = await selectInstance(collection)
            if(!selection){
                throw new CancellationError('user')
            } else {
                console.log(selection)
            }
}