/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { EmrApplication, EmrServerlessClient } from '../../shared/clients/emrServerlessClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EmrServerlessApplicationNode } from './emrServerlessApplicationNode'
import { EMRServerless } from 'aws-sdk'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { getIcon } from '../../shared/icons'

export class EmrServerlessJobNode extends AWSTreeNodeBase implements AWSResourceNode {
    arn: string = this.jobRun.arn
    public override readonly regionCode = this.parent.regionCode

    public constructor(
        public readonly parent: EmrServerlessApplicationNode,
        private readonly emrserverless: EmrServerlessClient,
        public readonly application: EmrApplication,
        public readonly jobRun: EMRServerless.JobRunSummary
    ) {
        super(`${jobRun.name || jobRun.id} [${jobRun.state}]`, vscode.TreeItemCollapsibleState.None)
        this.id = this.description = jobRun.id
        this.contextValue = 'awsEmrServerlessJobNode'
        this.tooltip = jobRun.stateDetails
        this.iconPath = jobRun.state === 'FAILED' ? getIcon('vscode-error') : undefined
    }

    public get name(): string {
        return this.jobRun.name ?? `(no name)`
    }

    public async getDashboard(): Promise<string> {
        const url = await this.emrserverless.getDashboardForJobRun(this.application.id, this.jobRun.id)
        return url
    }
}
