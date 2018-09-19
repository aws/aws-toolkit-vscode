'use strict'

import { TreeItem } from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

// Can be used to add a child node in an explorer when a region has no resources
// relevant to the explorer type.
export class NoFunctionsNode extends AWSTreeNodeBase implements TreeItem {

    constructor(public label: string, public contextValue?: string, public tooltip?: string) {
        super()
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return new Promise(resolve => resolve([]))
    }

    public getTreeItem(): TreeItem {
        return this
    }
}
