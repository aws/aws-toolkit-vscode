/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { FunctionInfo } from '../functionInfo'
import { getCloudFormationNodesForRegion, getLambdaFunctionsForRegion } from '../utils'
import { CloudFormationNode } from './cloudFormationNode'
import { RegionFunctionNode } from './functionNode'
import { GenericNode } from './genericNode'

// Collects the regions the user has declared they want to work with;
// on expansion each region lists the functions and CloudFormation Stacks
// the user has available in that region.
export class RegionNode extends AWSTreeNodeBase {
    public constructor(
        public readonly regionCode: string,
        public readonly regionName: string
    ) {
        super(regionName, TreeItemCollapsibleState.Expanded)
        this.tooltip = `${this.regionName} [${this.regionCode}]`
        this.contextValue = 'awsRegion'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        const lambdaFunctions: FunctionInfo[] = await getLambdaFunctionsForRegion(this.regionCode)

        const cloudFormationNodes: CloudFormationNode[] =
            await getCloudFormationNodesForRegion(this.regionCode, lambdaFunctions)

        const cloudFormationTreeNode = new GenericNode('CloudFormation', cloudFormationNodes)
        const lambdaTreeNode = new GenericNode('Lambda', lambdaFunctions.map(f => new RegionFunctionNode(f)))

        return [cloudFormationTreeNode, lambdaTreeNode]
    }

}
