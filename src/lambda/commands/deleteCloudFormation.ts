/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudFormation } from 'aws-sdk'
import * as vscode from 'vscode'
import { AwsContext } from '../../shared/awsContext'
import { CloudFormationNode } from '../explorer/cloudFormationNode'
import { getSelectedCloudFormationNode } from '../utils'

export async function deleteCloudFormation(awsContext: AwsContext, element?: CloudFormationNode) {
    let cloudFormationName: string = localize('AWS.lambda.policy.unknown.function', 'Unknown')

    const responseYes: string = localize('AWS.generic.response.yes', 'Yes')
    const responseNo: string = localize('AWS.generic.response.no', 'No')

    try {
        const cf: CloudFormationNode = await getSelectedCloudFormationNode(element)
        if (cf.stackSummary.StackName) {
            cloudFormationName = cf.stackSummary.StackName
        }

        const userResponse = await vscode.window.showInformationMessage(
            localize('AWS.message.prompt.deleteCloudFormation',
                     'Are you sure you want to delete {0}?', cloudFormationName),
            responseYes,
            responseNo)

        const req: CloudFormation.DeleteStackInput = { StackName: cloudFormationName }

        if (userResponse === responseYes) {
            cf.cloudFormation.deleteStack(req, async function(err, data) {
                if (err) {
                    await vscode.window.showInformationMessage(
                        localize('AWS.message.error.cloudFormation.delete',
                                 'An error occured while deleting {0}. Please check the stack events at AWS Console',
                                 cloudFormationName))
                } else {
                    await vscode.window.showInformationMessage(
                        localize('AWS.message.info.cloudFormation.delete',
                                 '{0} was deleted. Please check for any retained resources at AWS Console',
                                 cloudFormationName))
                }
            })

            cf.dispose()
        }

    } catch (err) {
        const error = err as Error

        // TODO: Handle error gracefully, possibly add a node that can attempt to retry the operation
        console.error(error.message)
    }
}
