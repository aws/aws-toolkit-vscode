/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from './awsTreeNodeBase'

// Used as a child node when an exception occurs while querying AWS resources
export class ErrorNode extends AWSTreeNodeBase {
    public constructor(public readonly parent: AWSTreeNodeBase, public readonly error: Error, label: string) {
        super(label, vscode.TreeItemCollapsibleState.None)

        this.tooltip = `${error.name}:${error.message}`
        this.contextValue = 'awsErrorNode'
    }
}
