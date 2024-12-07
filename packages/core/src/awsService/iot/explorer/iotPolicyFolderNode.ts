/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IotClient } from '../../../shared/clients/iotClient'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../../shared/treeview/utils'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../../awsexplorer/childNodeLoader'
import { ChildNodePage } from '../../../awsexplorer/childNodeLoader'
import { inspect } from 'util'
import { getLogger } from '../../../shared/logger'
import { IotPolicyWithVersionsNode } from './iotPolicyNode'
import { IotNode } from './iotNodes'
import { Settings } from '../../../shared/settings'
import { ClassToInterfaceType } from '../../../shared/utilities/tsUtils'

// Length of certificate ID. The certificate ID is the last segment of the ARN.
const certIdLength = 64

// Number of digits of the certificate ID to show
const certPreviewLength = 8

/**
 * Represents the group of all IoT Policies.
 */
export class IotPolicyFolderNode extends AWSTreeNodeBase implements LoadMoreNode {
    private readonly childLoader = new ChildNodeLoader(this, (token) => this.loadPage(token))

    public constructor(
        public readonly iot: IotClient,
        public readonly parent: IotNode,
        protected readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super('Policies', vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = 'IoT Policies'
        this.contextValue = 'awsIotPoliciesNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.iot.noPolicy', '[No Policies found]')),
        })
    }

    public async loadMoreChildren(): Promise<void> {
        await this.childLoader.loadMoreChildren()
    }

    public isLoadingMoreChildren(): boolean {
        return this.childLoader.isLoadingMoreChildren()
    }

    public clearChildren(): void {
        this.childLoader.clearChildren()
    }

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage<IotPolicyWithVersionsNode>> {
        getLogger().debug(`Loading page for %O using continuationToken %s`, this, continuationToken)
        const response = await this.iot.listPolicies({
            marker: continuationToken,
            pageSize: this.getMaxItemsPerPage(),
        })
        const newPolicies =
            response.policies
                ?.filter((policy) => policy.policyArn && policy.policyName)
                .map(
                    async (policy) =>
                        new IotPolicyWithVersionsNode(
                            { arn: policy.policyArn!, name: policy.policyName! },
                            this,
                            this.iot,
                            (await this.iot.listPolicyTargets({ policyName: policy.policyName! })).map((certId) =>
                                certId.slice(-certIdLength, -certIdLength + certPreviewLength)
                            )
                        )
                ) ?? []

        const resolvedPolicies = await Promise.all(newPolicies)

        getLogger().debug(`Loaded policies: %O`, newPolicies)
        return {
            newContinuationToken: response.nextMarker ?? undefined,
            newChildren: [...resolvedPolicies],
        }
    }

    public async refreshNode(): Promise<void> {
        this.clearChildren()
        return vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }

    public [inspect.custom](): string {
        return `IotPolicies`
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.settings.getSection('aws').get<number>('iot.maxItemsPerPage')
    }
}
