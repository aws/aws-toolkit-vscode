/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

'use strict'

import { AwsContext } from './awsContext'
import { RefreshableAwsTreeProvider } from './treeview/refreshableAwsTreeProvider'

export class AwsContextTreeCollection {
    private _trees: RefreshableAwsTreeProvider[]

    constructor() {
        this._trees = []
    }

    public addTree(tree: RefreshableAwsTreeProvider): void {
        this._trees.push(tree)
    }

    public refreshTrees(awsContext: AwsContext): void {
        this._trees.forEach(t => {
            t.refresh(awsContext)
        })
    }
}
