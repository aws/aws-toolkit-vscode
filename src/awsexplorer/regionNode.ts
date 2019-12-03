/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { SchemasNode } from '../eventSchemas/explorer/schemasNode'
import { CloudFormationNode } from '../lambda/explorer/cloudFormationNodes'
import { LambdaNode } from '../lambda/explorer/lambdaNodes'
import { RegionInfo } from '../shared/regions/regionInfo'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { toMap, updateInPlace } from '../shared/utilities/collectionUtils'

/**
 * An AWS Explorer node representing a region.
 * Contains resource types as child nodes (for example, nodes representing
 * an account's Lambda Functions and CloudFormation stacks for this region)
 */
export class RegionNode extends AWSTreeNodeBase {
    private info: RegionInfo
    private readonly cloudFormationNode: CloudFormationNode
    private readonly lambdaNode: LambdaNode
    private readonly schemasNode: SchemasNode

    public get regionCode(): string {
        return this.info.regionCode
    }

    public get regionName(): string {
        return this.info.regionName
    }

    public constructor(info: RegionInfo) {
        super(info.regionName, TreeItemCollapsibleState.Expanded)
        this.contextValue = 'awsRegionNode'
        this.info = info
        this.update(info)

        this.cloudFormationNode = new CloudFormationNode(this.regionCode)
        this.lambdaNode = new LambdaNode(this.regionCode)
        this.schemasNode = new SchemasNode(this.regionCode)
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return [this.cloudFormationNode, this.lambdaNode, this.schemasNode]
    }

    public update(info: RegionInfo): void {
        this.info = info
        this.label = info.regionName
        this.tooltip = `${info.regionName} [${info.regionCode}]`
    }
}

export class RegionNodeCollection {
    private readonly regionNodes: Map<string, RegionNode>

    public constructor() {
        this.regionNodes = new Map<string, RegionNode>()
    }

    public async updateChildren(regionDefinitions: RegionInfo[]): Promise<void> {
        const regionMap = toMap(regionDefinitions, r => r.regionCode)

        updateInPlace(
            this.regionNodes,
            regionMap.keys(),
            key => this.regionNodes.get(key)!.update(regionMap.get(key)!),
            key => new RegionNode(regionMap.get(key)!)
        )
    }
}
