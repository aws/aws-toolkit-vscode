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

export class LogGroupNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly regionCode: string,
        public configuration: CloudWatchLogs.LogGroup
    ) {
        super('')
        this.update(configuration)
        // TODO: Get Icons
        // this.iconPath = {
        //     dark: Uri.file(ext.iconPaths.dark.cloudWatchLogGroup),
        //     light: Uri.file(ext.iconPaths.light.cloudWatchLogGroup),
        // }
    }

    public update(configuration: CloudWatchLogs.LogGroup): void {
        this.configuration = configuration
        this.label = this.configuration.logGroupName || ''
        this.tooltip = `${this.configuration.logGroupName}${os.EOL}${this.configuration.arn}`
    }

    public get logGroupName(): string {
        return this.configuration.logGroupName || ''
    }

    public getArn(): string {
        return this.configuration.arn || ''
    }
}
