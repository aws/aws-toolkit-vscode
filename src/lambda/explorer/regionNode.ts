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

    constructor(regionCode:string, public regionName: string) {
        super(regionCode)
    }

    protected getLabel(): string {
        return this.regionName
    }

    protected getTooltip(): string | undefined {
        return `${this.getLabel()} [${this.regionCode}]`
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return new Promise(resolve => {
            getLambdaFunctionsForRegion(this.regionCode).then((result) => {
                const arr: AWSTreeNodeBase[] = result
                if (arr.length === 0) {
                    arr.push(new NoFunctionsNode(localize('AWS.explorerNode.lambda.noFunctions', '...no functions in this region...'),
                                                 'awsLambdaNoFns'))
                }
                resolve(arr)
            })
        })
    }

}
