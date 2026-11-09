/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSResourceNode } from './treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from './treeview/nodes/awsTreeNodeBase'
import { StackNameNode } from '../awsService/appBuilder/explorer/nodes/deployedStack'
import { openUrl } from './utilities/vsCodeUtils'

export function getAwsConsoleUrl(
    service: 'ecr' | 'cloudformation' | 'ec2-launch' | 'docdb',
    region: string
): vscode.Uri {
    switch (service) {
        case 'ecr':
            return vscode.Uri.parse(`https://${region}.console.aws.amazon.com/ecr/repositories?region=${region}`)
        case 'cloudformation':
            return vscode.Uri.parse(`https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}`)
        case 'ec2-launch':
            return vscode.Uri.parse(
                `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#LaunchInstances:`
            )
        case 'docdb':
            return vscode.Uri.parse(`https://${region}.console.aws.amazon.com/docdb/home?region=${region}`)
        default:
            throw Error()
    }
}

export async function openAwsConsoleCommand(node: AWSResourceNode) {
    // All AWSResourceNodes that this function will receive are also AWSTreeNodeBase,
    // so we should be able to get the region from them.
    const regionCode = (node as unknown as AWSTreeNodeBase).regionCode
    const arn = node.arn
    await openUrlInConsole(regionCode, arn)
}

export async function openAwsCFNConsoleCommand(node: StackNameNode) {
    const regionCode = node.resource.regionCode
    const arn = node.resource.arn
    await openUrlInConsole(regionCode, arn)
}

async function openUrlInConsole(regionCode: string | undefined, arn: string | undefined) {
    const regionQuery = regionCode ? `region=${regionCode}&` : ''
    const url = `https://console.aws.amazon.com/go/view?${regionQuery}arn=${arn}&source=aws-toolkit-vscode`
    await openUrl(vscode.Uri.parse(url), 'AppBuilderOpenConsole')
}
