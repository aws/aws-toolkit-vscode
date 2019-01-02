/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import {
    Disposable,
    TreeItem,
    TreeItemCollapsibleState
} from 'vscode'

export abstract class AWSTreeNodeBase extends TreeItem implements Disposable {
    protected children: AWSTreeNodeBase[] | undefined

    protected constructor(
        label: string,
        collapsibleState?: TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
    }

    public dispose() {
        if (this.children !== undefined) {
            this.children.forEach(c => c.dispose())
            this.children = undefined
        }
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return Promise.resolve([])
    }
}
