/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    Command,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState,
    Uri
} from 'vscode'

export interface AWSTreeNode {
    label?: string
    id?: string
    iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon
    resourceUri?: Uri
    tooltip?: string | undefined
    command?: Command
    collapsibleState?: TreeItemCollapsibleState
    contextValue?: string
    getChildren(): Thenable<AWSTreeNode[]>

}

export abstract class AWSTreeNodeBase extends TreeItem {
    protected constructor(
        label: string,
        collapsibleState?: TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
    }

    public getChildren(): Thenable<AWSTreeNode[]> {
        return Promise.resolve([])
    }
}
