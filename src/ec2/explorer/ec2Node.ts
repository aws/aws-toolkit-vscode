/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

export abstract class Ec2Base extends AWSTreeNodeBase {
    protected abstract readonly placeHolderMessage: string

    public constructor(label: string, public override readonly regionCode: string) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed)
    }
}

export class Ec2Node extends Ec2Base {
    protected override readonly placeHolderMessage = '[No EC2 Instances Found]'

    public constructor(regionCode: string) {
        super('EC2', regionCode)
        this.contextValue = 'awsEc2ParentNode'
    }
}
