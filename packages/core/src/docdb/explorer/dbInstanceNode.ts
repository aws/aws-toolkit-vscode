/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DBInstance } from '../../shared/clients/docdbClient'
import { DBNode } from './docdbNode'

/**
 * An AWS Explorer node representing a DocumentDB instance.
 */
export class DBInstanceNode extends AWSTreeNodeBase {
    public name: string = this.instance.DBInstanceIdentifier ?? ''

    constructor(public readonly parent: DBNode, readonly instance: DBInstance) {
        super(instance.DBInstanceIdentifier ?? '[Instance]', vscode.TreeItemCollapsibleState.None)
        this.description = this.makeDescription()
        this.contextValue = 'awsDocDBInstanceNode'
    }

    private makeDescription(): string {
        const type = this.instance.IsClusterWriter ? 'primary' : 'replica'
        return `${type} • ${this.instance.DBInstanceClass}`
    }

    public [inspect.custom](): string {
        return 'DBInstanceNode'
    }
}
