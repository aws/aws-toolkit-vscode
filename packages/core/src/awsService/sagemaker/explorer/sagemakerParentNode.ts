/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { makeChildrenNodes } from '../../../shared/treeview/utils'
import { updateInPlace } from '../../../shared/utilities/collectionUtils'
import { SagemakerSpaceNode } from './sagemakerSpaceNode'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'

export const parentContextValue = 'awsSagemakerParentNode'

export class SagemakerParentNode extends AWSTreeNodeBase {
    protected readonly placeHolderMessage = '[No Sagemaker Spaces Found]'
    protected sagemakerSpaceNodes: Map<string, SagemakerSpaceNode>
    public override readonly contextValue: string = parentContextValue

    public constructor(
        public override readonly regionCode: string,
        protected readonly sagemakerClient: SagemakerClient
    ) {
        super('Sagemaker', vscode.TreeItemCollapsibleState.Collapsed)
        this.sagemakerSpaceNodes = new Map<string, SagemakerSpaceNode>()
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const result = await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()
                return [...this.sagemakerSpaceNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, this.placeHolderMessage),
            sort: (nodeA, nodeB) => nodeA.name.localeCompare(nodeB.name),
        })

        return result
    }

    public async updateChildren(): Promise<void> {
        const spaceAppMap = await this.sagemakerClient.fetchSpaceApps()

        updateInPlace(
            this.sagemakerSpaceNodes,
            spaceAppMap.keys(),
            (key) => this.sagemakerSpaceNodes.get(key)!.updateSpace(spaceAppMap.get(key)!),
            (key) => new SagemakerSpaceNode(this, this.sagemakerClient, this.regionCode, spaceAppMap.get(key)!)
        )
    }
}
