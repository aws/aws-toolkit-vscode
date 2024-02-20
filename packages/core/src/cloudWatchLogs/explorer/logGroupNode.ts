/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs } from 'aws-sdk'
import * as os from 'os'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { getIcon } from '../../shared/icons'
import { localize } from '../../shared/utilities/vsCodeUtils'

export const contextValueCloudwatchLog = 'awsCloudWatchLogNode'

export class LogGroupNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(public override readonly regionCode: string, public logGroup: CloudWatchLogs.LogGroup) {
        super('')
        this.update(logGroup)
        this.iconPath = getIcon('aws-cloudwatch-log-group')
        this.contextValue = contextValueCloudwatchLog
        this.command = {
            command: 'aws.cwl.viewLogStream',
            title: localize('AWS.command.cloudWatchLogs.viewLogStream', 'View Log Stream'),
            arguments: [this],
        }
    }

    public update(logGroup: CloudWatchLogs.LogGroup): void {
        this.logGroup = logGroup
        this.label = this.logGroup.logGroupName || ''
        this.tooltip = `${this.logGroup.logGroupName}${os.EOL}${this.logGroup.arn}`
    }

    public get name(): string {
        return this.logGroup.logGroupName!
    }

    public get arn(): string {
        if (this.logGroup.arn === undefined) {
            throw new Error('Log Group Arn expected but not found')
        }

        return this.logGroup.arn
    }
}
