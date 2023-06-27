/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { Ec2InstanceNode } from './ec2InstanceNode'

export const contextValueEc2 = 'awsEc2Node'

export class Ec2ParentNode extends AWSTreeNodeBase {
    protected readonly placeHolderMessage = '[No EC2 Instances Found]'

    public constructor(public override readonly regionCode: string) {
        super('EC2', vscode.TreeItemCollapsibleState.Collapsed)
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                return [new Ec2InstanceNode(this.regionCode)]
            },
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, this.placeHolderMessage),
            sort: (nodeA, nodeB) => nodeA.name.localeCompare(nodeB.name),
        })
    }
}
