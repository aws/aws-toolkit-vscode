/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'
import { DefaultEcsClustersNode } from './ecsClustersNode'
import {
    EcsClustersNode,
    EcsNode,
    EcsTaskDefinitionsNode
} from './ecsNodeInterfaces'
import { DefaultEcsTaskDefinitionsNode } from './ecsTaskDefinitionsNode'

export class DefaultEcsNode extends AWSTreeNodeBase implements EcsNode {
    private readonly clustersNode: EcsClustersNode
    private readonly taskDefinitionsNode: EcsTaskDefinitionsNode

    public constructor(
        public readonly parent: RegionNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('ECS', vscode.TreeItemCollapsibleState.Collapsed)
        this.clustersNode = new DefaultEcsClustersNode(this, this.getExtensionAbsolutePath)
        this.taskDefinitionsNode = new DefaultEcsTaskDefinitionsNode(this, this.getExtensionAbsolutePath)
        this.update()
    }

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public async getChildren(): Promise<AWSTreeErrorHandlerNode[]> {
        return [
            this.clustersNode,
            this.taskDefinitionsNode
        ]
    }

    public update(): void {
        this.tooltip = this.label
    }
}
