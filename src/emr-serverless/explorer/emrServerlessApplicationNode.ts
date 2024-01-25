/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { EmrApplication, EmrServerlessClient } from '../../shared/clients/emrServerlessClient'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EmrServerlessNode } from './emrServerlessNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { EmrServerlessJobNode } from './emrServerlessJobNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'

export const EmrServerlessStoppedApplicationContext = 'awsEmrServerlessStoppedApplicationNode'
export const EmrServerlessStartedApplicationContext = 'awsEmrServerlessStartedApplicationNode'
export const EmrServerlessApplicationContext = 'awsEmrServerlessApplicationNode'

type EmrServerlessApplicationNodeContext =
    | 'awsEmrServerlessStoppedApplicationNode'
    | 'awsEmrServerlessStartedApplicationNode'
    | 'awsEmrServerlessApplicationNode'

export class EmrServerlessApplicationNode extends AWSTreeNodeBase implements AWSResourceNode {
    arn: string = this.application.arn
    public override readonly regionCode: string

    constructor(
        public readonly parent: EmrServerlessNode,
        private readonly emrserverless: EmrServerlessClient,
        public readonly application: EmrApplication
    ) {
        super(application.name || 'undefined', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = this.getContext()
        this.regionCode = emrserverless.regionCode
        this.id = this.description = this.application.id
        this.tooltip = `${this.name} (${this.id})`
        this.label = `${this.name} [${application.state}]`
    }

    public get name(): string {
        return this.application.name ?? `(no name)`
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await toArrayAsync(this.emrserverless.listJobRuns(this.application.id))
                return response.map(item => new EmrServerlessJobNode(this, this.emrserverless, this.application, item))
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.emrserverless.noJobRuns', '[No job runs found]')),
        })
    }

    private getContext(): EmrServerlessApplicationNodeContext {
        if (this.application.state === 'STARTED') {
            return EmrServerlessStartedApplicationContext
        }

        if (this.application.state === 'STOPPED') {
            return EmrServerlessStoppedApplicationContext
        }

        return EmrServerlessApplicationContext
    }

    public async startApplication(): Promise<void> {
        await this.emrserverless.startApplication(this.application.id)
        await this.emrserverless.waitForApplicationState(this.application.id, 'STARTED')
    }

    public async stopApplication(): Promise<void> {
        await this.emrserverless.stopApplication(this.application.id)
        await this.emrserverless.waitForApplicationState(this.application.id, 'STOPPED')
    }
}
