/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { AWSTreeNode, AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

// Used as a child node when an exception occurs while querying AWS resources
export class ErrorNode extends AWSTreeNodeBase {
    public readonly parent: AWSTreeNode
    public readonly error: Error
    public constructor({parent, label, error}: {
        parent: AWSTreeNode
        error: Error
        label: string
    }) {
        super(label, vscode.TreeItemCollapsibleState.None)
        this.parent = parent
        this.error = error

        this.tooltip = `${error.name}:${error.message}`
        this.contextValue = 'awsErrorNode'
    }
}
