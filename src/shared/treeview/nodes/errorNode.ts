/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from './awsTreeNodeBase'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { getLogger, Logger } from '../../../shared/logger/logger'
import { getLogTracker, LogTrackerRecord } from '../../../shared/logger/logTracker'

// Used as a child node when an exception occurs while querying AWS resources
export class ErrorNode extends AWSTreeNodeBase {
    public constructor(public readonly parent: AWSTreeNodeBase, public readonly error: Error, label: string) {
        super(label, vscode.TreeItemCollapsibleState.None)
        const commandName: string = localize('AWS.command.viewLogs', 'View AWS Toolkit Logs')
        const tooltip: string = localize('AWS.explorerNode.error.tooltip', 'Click to view error in Toolkit logs')
        const logger: Logger = getLogger()
        const logRecord: LogTrackerRecord = getLogTracker().registerLog()
        logger.error(error, { logID: logRecord.logID })     

        this.tooltip = tooltip
        // Theme color for icons were introduced in the 1.51.0 October 2020 update of vscode
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'))
        this.contextValue = 'awsErrorNode'
        this.command = {
            command: 'aws.viewLogsAtMessage',
            title: commandName,
            tooltip: tooltip,
            arguments: [logRecord.logMessage],
        }
    }
}
