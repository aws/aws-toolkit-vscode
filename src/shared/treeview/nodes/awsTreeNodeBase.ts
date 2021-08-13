/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { ext } from '../../extensionGlobals'
import { isCloud9 } from '../../extensionUtilities'

export abstract class AWSTreeNodeBase extends TreeItem {
    protected constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
        super(label, collapsibleState)
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return Promise.resolve([])
    }

    public refresh(): void {
        if (isCloud9()) {
            ext.awsExplorer.refresh()
        } else {
            ext.awsExplorer.refresh(this)
        }
    }
}
