/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export function getAwsConsoleUrl(service: 'ecr' | 'cloudformation' | 'ec2-launch', region: string): vscode.Uri {
    switch (service) {
        case 'ecr':
            return vscode.Uri.parse(`https://${region}.console.aws.amazon.com/ecr/repositories?region=${region}`)
        case 'cloudformation':
            return vscode.Uri.parse(`https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}`)
        case 'ec2-launch':
            return vscode.Uri.parse(
                `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#LaunchInstances:`
            )
        default:
            throw Error()
    }
}
