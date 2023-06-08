/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2 } from 'aws-sdk'
import globals from '../shared/extensionGlobals'
import { pageableToCollection } from '../shared/utilities/collectionUtils'
import { extractInstanceIdsFromReservations } from "./utils"
import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { createEC2ConnectPrompter, handleEc2ConnectPrompterResponse } from './prompter'
import { isValidResponse } from '../shared/wizards/wizard'

export async function getInstanceIdsFromRegion(regionCode: string): Promise<AsyncCollection<string>> {
    const client = await globals.sdkClientBuilder.createAwsService(EC2, undefined, regionCode)
    const requester = async (request: EC2.DescribeInstancesRequest) => 
        client.describeInstances(request).promise() 
        
    const instanceIds = extractInstanceIdsFromReservations(pageableToCollection(requester, {}, 'NextToken', 'Reservations'))
    return instanceIds
}

export async function connectToEC2Instance(): Promise<void> {
    const prompter = createEC2ConnectPrompter()
            const response = await prompter.prompt()

            if(isValidResponse(response)){
                const selection = handleEc2ConnectPrompterResponse(response)
                console.log(selection)
            }
}
