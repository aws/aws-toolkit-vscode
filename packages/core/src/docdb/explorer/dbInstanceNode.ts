/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DBClusterMember } from '@aws-sdk/client-docdb'

/**
 * An AWS Explorer node representing a DocumentDB instance.
 */
export class DBInstanceNode extends AWSTreeNodeBase {
    public name: string = this.instance.DBInstanceIdentifier ?? ''

    constructor(readonly instance: DBClusterMember) {
        super(instance.DBInstanceIdentifier ?? '[Instance]', vscode.TreeItemCollapsibleState.None)
        this.description = this.makeDescription()
        this.contextValue = 'awsDocDBInstanceNode'
    }

    private makeDescription(): string {
        const type = this.instance.IsClusterWriter ? 'primary' : 'replica'
        return type
    }

    public [inspect.custom](): string {
        return 'DBInstanceNode'
    }
}
