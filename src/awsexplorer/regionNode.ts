/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { SchemasNode } from '../eventSchemas/explorer/schemasNode'
import { CloudFormationNode } from '../lambda/explorer/cloudFormationNodes'
import { LambdaNode } from '../lambda/explorer/lambdaNodes'
import { RegionInfo } from '../shared/regions/regionInfo'
import { RegionProvider } from '../shared/regions/regionProvider'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'

/**
 * An AWS Explorer node representing a region.
 * Contains resource types as child nodes (for example, nodes representing
 * an account's Lambda Functions and CloudFormation stacks for this region)
 */
export class RegionNode extends AWSTreeNodeBase {
    private info: RegionInfo
    private readonly childNodes: AWSTreeNodeBase[] = []

    public get regionCode(): string {
        return this.info.regionCode
    }

    public get regionName(): string {
        return this.info.regionName
    }

    public constructor(info: RegionInfo, regionProvider: RegionProvider) {
        super(info.regionName, TreeItemCollapsibleState.Expanded)
        this.contextValue = 'awsRegionNode'
        this.info = info
        this.update(info)

        if (regionProvider.isServiceInRegion('cloudformation', info.regionCode)) {
            this.childNodes.push(new CloudFormationNode(this.regionCode))
        }

        if (regionProvider.isServiceInRegion('lambda', info.regionCode)) {
            this.childNodes.push(new LambdaNode(this.regionCode))
        }

        if (regionProvider.isServiceInRegion('schemas', info.regionCode)) {
            this.childNodes.push(new SchemasNode(this.regionCode))
        }
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return this.childNodes
    }

    public update(info: RegionInfo): void {
        this.info = info
        this.label = info.regionName
        this.tooltip = `${info.regionName} [${info.regionCode}]`
    }
}
