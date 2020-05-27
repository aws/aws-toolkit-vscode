/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs } from 'aws-sdk'
import * as os from 'os'
import { Uri } from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

export const CONTEXT_VALUE_CLOUDWATCH_LOG = 'awsCloudWatchLogNode'

export class LogGroupNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly regionCode: string,
        public logGroup: CloudWatchLogs.LogGroup
    ) {
        super('')
        this.update(logGroup)
        this.iconPath = {
            dark: Uri.file(ext.iconPaths.dark.cloudWatchLogGroup),
            light: Uri.file(ext.iconPaths.light.cloudWatchLogGroup),
        }
        this.contextValue = CONTEXT_VALUE_CLOUDWATCH_LOG
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
