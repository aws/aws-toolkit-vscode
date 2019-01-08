/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { CloudFormationClient } from '../../shared/clients/cloudFormationClient'
import { ext } from '../../shared/extensionGlobals'
import { CloudFormationStackNode } from '../explorer/cloudFormationNodes'

export async function deleteCloudFormation(
    element?: CloudFormationStackNode
) {
    if (!element) {
        return
    }

    const stackName = element.label || localize('AWS.lambda.policy.unknown.function', 'Unknown')

    const responseYes: string = localize('AWS.generic.response.yes', 'Yes')
    const responseNo: string = localize('AWS.generic.response.no', 'No')

    try {
        const userResponse = await vscode.window.showInformationMessage(
            localize(
                'AWS.message.prompt.deleteCloudFormation',
                'Are you sure you want to delete {0}?',
                stackName
            ),
            responseYes,
            responseNo
        )

        if (userResponse === responseYes) {
            const client: CloudFormationClient = ext.toolkitClientBuilder.createCloudFormationClient(element.regionCode)

            await client.deleteStack(stackName)

            vscode.window.showInformationMessage(localize(
                'AWS.message.info.cloudFormation.delete',
                'Deleted CloudFormation Stack {0}',
                stackName
            ))

            element.dispose()
        }

    } catch (err) {
        const error = err as Error

        vscode.window.showInformationMessage(localize(
            'AWS.message.error.cloudFormation.delete',
            'An error occurred while deleting {0}. Please check the stack events on the AWS Console',
            stackName
        ))

        console.error(error.message)
    }
}
