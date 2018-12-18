/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { AWSRegionTreeNode } from '../../shared/treeview/awsRegionTreeNode'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { getCloudFormationsForRegion, getLambdaFunctionsForRegion } from '../utils'
import { CloudFormationNode } from './cloudFormationNode'
import { FunctionNode } from './functionNode'
import { GenericNode } from './genericNode'

// Collects the regions the user has declared they want to work with;
// on expansion each region lists the functions and CloudFormations
// the user has available in that region.
export class RegionNode extends AWSRegionTreeNode {

    public constructor(regionCode: string, public regionName: string) {
        super(regionCode)
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        const lambdaFunctions: FunctionNode[] = await getLambdaFunctionsForRegion(this.regionCode)

        const cloudFormations: CloudFormationNode[] =
            await getCloudFormationsForRegion(this.regionCode, lambdaFunctions)

        const cloudFormationTreeNode = new GenericNode('CloudFormation', cloudFormations)
        const lambdaTreeNode = new GenericNode('Lambda', lambdaFunctions)

        return [cloudFormationTreeNode, lambdaTreeNode]
    }

    public getLabel(): string {
        return this.regionName
    }

    public getTooltip(): string | undefined {
        return `${this.getLabel()} [${this.regionCode}]`
    }
}
