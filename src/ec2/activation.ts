/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'
import { isValidResponse } from '../shared/wizards/wizard'
import { EC2ConnectWizard } from './wizard'


export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        Commands.register('aws.ec2.connectToInstance', async (param?: unknown) => {
            console.log("You just ran the aws.ec2.connectToInstance command!")
            const wizard = new EC2ConnectWizard()
            const response = await wizard.run()

            // Debugging temporary line
            isValidResponse(response) ? console.log(response.submenuResponse.data) : console.log("User cancelled, or something went wrong.")
        })
    )
}
