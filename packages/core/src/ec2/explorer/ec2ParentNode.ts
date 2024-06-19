/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { Ec2InstanceNode } from './ec2InstanceNode'
import { Ec2Client } from '../../shared/clients/ec2Client'
import { updateInPlace } from '../../shared/utilities/collectionUtils'

export const parentContextValue = 'awsEc2ParentNode'
export type Ec2Node = Ec2InstanceNode | Ec2ParentNode

export class Ec2ParentNode extends AWSTreeNodeBase {
    protected readonly placeHolderMessage = '[No EC2 Instances Found]'
    protected ec2InstanceNodes: Map<string, Ec2InstanceNode>
    public override readonly contextValue: string = parentContextValue

    public constructor(
        public override readonly regionCode: string,
        public readonly partitionId: string,
        protected readonly ec2Client: Ec2Client
    ) {
        super('EC2', vscode.TreeItemCollapsibleState.Collapsed)
        this.ec2InstanceNodes = new Map<string, Ec2InstanceNode>()
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.ec2InstanceNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, this.placeHolderMessage),
            sort: (nodeA, nodeB) => nodeA.name.localeCompare(nodeB.name),
        })
    }

    public async updateChildren(): Promise<void> {
        const ec2Instances = await (await this.ec2Client.getInstances()).toMap(instance => instance.InstanceId)
        updateInPlace(
            this.ec2InstanceNodes,
            ec2Instances.keys(),
            key => this.ec2InstanceNodes.get(key)!.updateInstance(ec2Instances.get(key)!),
            key => new Ec2InstanceNode(this, this.ec2Client, this.regionCode, this.partitionId, ec2Instances.get(key)!)
        )
    }

    public async clearChildren() {
        this.ec2InstanceNodes = new Map<string, Ec2InstanceNode>()
    }

    public async refreshNode(): Promise<void> {
        await this.clearChildren()
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }
}
