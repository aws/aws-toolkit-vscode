/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../shared/extensionGlobals'
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { createRegionPrompter } from '../shared/ui/common/region'

import { extractInstanceIds, selectInstance } from './commands'
import { EC2 } from 'aws-sdk'
import { isValidResponse } from '../shared/wizards/wizard'
import { getLogger } from '../shared/logger/logger'
import { pageableToCollection } from '../shared/utilities/collectionUtils'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ec2.connectToInstance', async (param?: unknown) => {
            console.log("You just ran the aws.ec2.connectToInstance command!")
            
            const regionPrompter = createRegionPrompter()
            const selectedRegion = await regionPrompter.prompt()
            if(isValidResponse(selectedRegion)){
                const client = await globals.sdkClientBuilder.createAwsService(EC2, undefined, selectedRegion.id)
                const requester = async (request: EC2.DescribeInstancesRequest) => 
                    client.describeInstances(request).promise() 
                const collection = pageableToCollection(requester, {}, 'NextToken', 'Reservations')
                .flatten().map(instanceList => instanceList?.Instances).flatten().map(instance => instance?.InstanceId)

                const selection = await selectInstance(collection.filter(instanceId => instanceId !== undefined))
                console.log(selection)
            }
        })
    )
}
