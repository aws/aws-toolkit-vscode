/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { CloudFormationNode, DefaultCloudFormationNode } from '../lambda/explorer/cloudFormationNodes'
import { DefaultLambdaFunctionGroupNode, LambdaFunctionGroupNode } from '../lambda/explorer/lambdaNodes'
import { ActiveFeatureKeys, FeatureToggle } from '../shared/featureToggle'
import { RegionInfo } from '../shared/regions/regionInfo'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { RegionNode } from '../shared/treeview/nodes/regionNode'
import { DefaultEcsNode } from './nodes/ecsNode'
import { EcsNode } from './nodes/ecsNodeInterfaces'

// Collects the regions the user has declared they want to work with;
// on expansion each region lists the functions and CloudFormation Stacks
// the user has available in that region.
export class DefaultRegionNode extends AWSTreeNodeBase implements RegionNode {
    private info: RegionInfo
    private readonly cloudFormationNode: CloudFormationNode
    private readonly lambdaFunctionGroupNode: LambdaFunctionGroupNode
    // TODO: Remove `undefined` when feature flag `EcsExplorer` is removed
    // REMOVE_WHEN_ECS_STABLE
    private readonly ecsNode: EcsNode | undefined

    public get regionCode(): string {
        return this.info.regionCode
    }

    public get regionName(): string {
        return this.info.regionName
    }

    public constructor(
        info: RegionInfo,
        featureToggle: FeatureToggle,
        getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super(info.regionName, TreeItemCollapsibleState.Expanded)
        this.contextValue = 'awsRegionNode'
        this.info = info
        this.update(info)

        this.cloudFormationNode = new DefaultCloudFormationNode(this, getExtensionAbsolutePath)
        this.lambdaFunctionGroupNode = new DefaultLambdaFunctionGroupNode(this, getExtensionAbsolutePath)
        // TODO: Remove when feature flag `EcsExplorer` is removed
        // REMOVE_WHEN_ECS_STABLE
        if (featureToggle.isFeatureActive(ActiveFeatureKeys.EcsExplorer)) {
            this.ecsNode = new DefaultEcsNode(this, getExtensionAbsolutePath)
        }
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        const children: AWSTreeNodeBase[] = [
            this.cloudFormationNode,
            this.lambdaFunctionGroupNode
        ]

        // TODO: Remove when feature flag `EcsExplorer` is removed
        // REMOVE_WHEN_ECS_STABLE
        if (this.ecsNode) {
            children.push(this.ecsNode)
        }

        return children
    }

    public update(info: RegionInfo): void {
        this.info = info
        this.label = info.regionName
        this.tooltip = `${info.regionName} [${info.regionCode}]`
    }
}
