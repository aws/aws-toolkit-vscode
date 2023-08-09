/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// eslint-disable-next-line header/header
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

export class RedshiftTableNode extends AWSTreeNodeBase {
    public constructor(public readonly tableName: string) {
        super(tableName, vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsRedshiftTableNode'
    }
}
