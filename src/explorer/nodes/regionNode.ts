/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { getCloudFormationsForRegion } from '../../cloudformation/utils'
import { getLambdaFunctionsForRegion } from '../../lambda/utils'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { CloudFormationNode } from './cloudFormationNode'
import { FunctionNode } from './functionNode'
import { GenericNode } from './genericNode'

// Collects the regions the user has declared they want to work with;
// on expansion each region lists the functions and CloudFormations
// the user has available in that region.
export class RegionNode extends AWSTreeNodeBase {
    public readonly contextValue: string = 'awsRegion'

    public constructor(public readonly regionCode: string, public readonly regionName: string) {
        super()
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        const lambdaFunctions: FunctionNode[] = await getLambdaFunctionsForRegion(this.regionCode)

        const cloudFormations: CloudFormationNode[] =
            await getCloudFormationsForRegion(this.regionCode, lambdaFunctions)

        const cloudFormationTreeNode = new GenericNode('CloudFormation', cloudFormations)
        const lambdaTreeNode = new GenericNode('Lambda', lambdaFunctions)

        return [cloudFormationTreeNode, lambdaTreeNode]
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem(this.regionName, TreeItemCollapsibleState.Expanded)
        item.tooltip = `${this.regionName} [${this.regionCode}]`
        item.contextValue = this.contextValue

        return item
    }
}
