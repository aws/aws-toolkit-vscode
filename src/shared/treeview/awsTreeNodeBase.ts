/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ext } from '../extensionGlobals'
import { types as vscode } from '../vscode'

export abstract class AWSTreeNodeBase extends ext.vscode.TreeItem {
    protected constructor(
        label: string,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return Promise.resolve([])
    }
}
