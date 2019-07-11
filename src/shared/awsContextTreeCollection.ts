/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RefreshableAwsTreeProvider } from './treeview/awsTreeProvider'

export class AwsContextTreeCollection {
    private readonly _trees: RefreshableAwsTreeProvider[]

    public constructor() {
        this._trees = []
    }

    public addTree(tree: RefreshableAwsTreeProvider): void {
        this._trees.push(tree)
    }

    public refreshTrees(): void {
        this._trees.forEach(t => {
            t.refresh()
        })
    }
}
