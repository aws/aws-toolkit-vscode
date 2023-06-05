/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../shared/extensionGlobals'
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { createRegionPrompter } from '../shared/ui/common/region'

import { selectInstance } from './commands'
import { EC2 } from 'aws-sdk'
import { isValidResponse } from '../shared/wizards/wizard'
import { getLogger } from '../shared/logger/logger'

export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ec2.connectToInstance', async (param?: unknown) => {
            console.log("You just ran the aws.ec2.connectToInstance command!")
            
            const regionPrompter = createRegionPrompter()
            const selectedRegion = await regionPrompter.prompt()
            if(isValidResponse(selectedRegion)){
                const client = await globals.sdkClientBuilder.createAwsService(EC2, undefined, selectedRegion.id)
                const request = client.describeInstances()
                request.send(function (err, data) {
                    if (err) {
                        console.log("We got an error.")
                    } else {
                        console.log("Your instances are: ")
                        data.Reservations?.forEach( (curReservation) => 
                        curReservation.Instances?.forEach( (curInstance) => 
                            console.log(curInstance.InstanceId)
                        ))
                    }

                })
            }
            // const selection = await selectInstance()
            // console.log(selection)
        })
    )
}
