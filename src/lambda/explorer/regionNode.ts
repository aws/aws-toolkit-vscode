/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { AWSRegionTreeNode } from '../../shared/treeview/awsRegionTreeNode'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { getCloudFormationsForRegion, getLambdaFunctionsForRegion } from '../utils'
import { CloudFormationNode } from './cloudFormationNode'
import { ContainerNode } from './containerNode'
import { FunctionNode } from './functionNode'
import { NoFunctionsNode } from './noFunctionsNode'

// Collects the regions the user has declared they want to work with;
// on expansion each region lists the functions the user has available
// in that region. For regions with no deployed functions we output
// a placeholder child.
export class RegionNode extends AWSRegionTreeNode {

    public constructor(regionCode: string, public regionName: string) {
        super(regionCode)
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        const lambdaFunctions: FunctionNode[] = await getLambdaFunctionsForRegion(this.regionCode)

        if (lambdaFunctions.length === 0) {
            return [new NoFunctionsNode(
                localize('AWS.explorerNode.region.noResources', '[no resources in this region]'),
                'awsRegionNoResources'
            )]
        }

        const cloudFormations: CloudFormationNode[] =
            await getCloudFormationsForRegion(this.regionCode, lambdaFunctions)

        const cloudFormationContainer = new ContainerNode('CloudFormation', cloudFormations)
        const lambdaContainer = new ContainerNode('Lambda', lambdaFunctions)

        return [cloudFormationContainer, lambdaContainer]
    }

    public getLabel(): string {
        return this.regionName
    }

    public getTooltip(): string | undefined {
        return `${this.getLabel()} [${this.regionCode}]`
    }
}
