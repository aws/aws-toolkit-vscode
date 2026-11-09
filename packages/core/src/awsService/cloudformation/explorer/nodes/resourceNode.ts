/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'

export class ResourceNode extends AWSTreeNodeBase {
    public constructor(
        public readonly resourceIdentifier: string,
        public readonly resourceType: string
    ) {
        super(resourceIdentifier, TreeItemCollapsibleState.None)
        this.contextValue = 'resource'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
