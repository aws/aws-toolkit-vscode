/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from './awsTreeNodeBase'
import { localize } from '../../../shared/utilities/vsCodeUtils'

// Used as a child node when an exception occurs while querying AWS resources
export class ErrorNode extends AWSTreeNodeBase {
    public constructor(public readonly parent: AWSTreeNodeBase, public readonly error: Error, label: string, logID: number = -1) {
        super(label, vscode.TreeItemCollapsibleState.None)
        const commandName: string = localize('AWS.command.viewLogs', 'View AWS Toolkit Logs')
        const tooltip: string = localize('AWS.explorerNode.error.tooltip', 'Click to view error in Toolkit logs')

        // Theme color for icons were introduced in the 1.51.0 October 2020 update of vscode
        // TODO: get 'error' icons made for cloud9 
        // this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'))
        this.iconPath = new vscode.ThemeIcon('error')
        this.contextValue = 'awsErrorNode'
        this.tooltip = tooltip
        this.command = {
            command: 'aws.viewLogsAtMessage',
            title: commandName,
            tooltip: tooltip,
            arguments: [logID],
        }
    }
}
