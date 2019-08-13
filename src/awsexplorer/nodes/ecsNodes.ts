/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'
import {
    EcsClusterNode,
    EcsClustersNode,
    EcsNode,
    EcsServiceNode,
    EcsServicesNode,
    EcsTaskDefinitionNode,
    EcsTaskDefinitionsNode
} from './ecsNodeInterfaces'

export class DefaultEcsNode extends AWSTreeErrorHandlerNode implements EcsNode {
    private readonly clustersNode: EcsClustersNode
    private readonly taskDefinitionsNode: EcsTaskDefinitionsNode

    public constructor(
        public readonly parent: RegionNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('ECS', vscode.TreeItemCollapsibleState.Collapsed)
        this.clustersNode = new DefaultEcsClustersNode(this, this.getExtensionAbsolutePath)
        this.taskDefinitionsNode = new DefaultEcsTaskDefinitionsNode(this, this.getExtensionAbsolutePath)
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
}

export class DefaultEcsClustersNode extends AWSTreeErrorHandlerNode implements EcsClustersNode {
    private readonly clusterNodes: Map<string, EcsClusterNode>

    public constructor(
        public readonly parent: RegionNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)
        this.clusterNodes = new Map<string, EcsClusterNode>()
        // TODO: Get new icons
        // this.iconPath = {
        //     dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/cloudformation.svg')),
        //     light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/cloudformation.svg')),
        // }
    }
}

export class DefaultEcsTaskDefinitionsNode extends AWSTreeErrorHandlerNode implements EcsTaskDefinitionsNode {
    private readonly taskDefinitionNodes: Map<string, EcsTaskDefinitionNode>
}

export class DefaultEcsClusterNode extends AWSTreeErrorHandlerNode implements EcsClusterNode {
    private readonly servicesNode: EcsServicesNode
}

export class DefaultEcsServicesNode extends AWSTreeErrorHandlerNode implements EcsServicesNode {
    private readonly serviceNodes: Map<string, EcsServiceNode>
}