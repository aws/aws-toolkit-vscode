/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from './awsTreeNodeBase'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { isCn } from '../../extensionUtilities'

// Used as a child node when an exception occurs while querying AWS resources
export class ErrorNode extends AWSTreeNodeBase {
    /**
     * Creates a new error node to be used in the Explorer tree
     * 
     * @param parent  Node's parent
     * @param error  Error that generated this node
     * @param logID  Optional reference to a log message related to this node
     * @param logUri  Optional reference to the log containing the message
     */
    public constructor(
        public readonly parent: AWSTreeNodeBase, 
        public readonly error: Error, 
        logID?: number,
        logUri?: vscode.Uri
    ) {
        super(
            localize('AWS.explorerNode.error.label', 'Failed to load resources (click for logs)'), 
            vscode.TreeItemCollapsibleState.None
        )
        // Node commands don't actually use the title or tooltip since they are not apart of the command palette
        const commandName: string = isCn() ? localize('AWS.command.viewLogs.cn', 'View Amazon Toolkit Logs') :  localize('AWS.command.viewLogs', 'View AWS Toolkit Logs')
        const tooltip: string = `${error.name}: ${error.message}`

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
            arguments: [logID, logUri],
        }
    }
}
