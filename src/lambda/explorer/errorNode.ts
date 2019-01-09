/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

// Used when an exception occurs while querying AWS resources
export class ErrorNode extends AWSTreeNodeBase {
    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly error: Error
    ) {
        super(`Error loading resources (${error.name})`,
              vscode.TreeItemCollapsibleState.None)

        this.contextValue = 'awsErrorNode'
        this.iconPath = {
            dark: vscode.Uri.file(ext.context.asAbsolutePath('resources/dark/error.svg')),
            light: vscode.Uri.file(ext.context.asAbsolutePath('resources/light/error.svg'))
        }
    }
}
