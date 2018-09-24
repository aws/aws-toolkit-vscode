/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
let localize = nls.loadMessageBundle()

import { AWSRegionTreeNode } from '../../shared/treeview/awsRegionTreeNode'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { getLambdaFunctionsForRegion } from '../utils'
import { NoFunctionsNode } from './noFunctionsNode'

// Collects the regions the user has declared they want to work with;
// on expansion each region lists the functions the user has available
// in that region. For regions with no deployed functions we output
// a placeholder child.
export class RegionNode extends AWSRegionTreeNode {

    constructor(regionCode: string, public regionName: string) {
        super(regionCode)
    }

    protected getLabel(): string {
        return this.regionName
    }

    protected getTooltip(): string | undefined {
        return `${this.getLabel()} [${this.regionCode}]`
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        const lambdaFunctions: AWSTreeNodeBase[] = await getLambdaFunctionsForRegion(this.regionCode)

        if (lambdaFunctions.length === 0) {
            lambdaFunctions.push(new NoFunctionsNode(localize('AWS.explorerNode.lambda.noFunctions', '[no functions in this region]'),
                'awsLambdaNoFns'))
        }

        return lambdaFunctions
    }

}
