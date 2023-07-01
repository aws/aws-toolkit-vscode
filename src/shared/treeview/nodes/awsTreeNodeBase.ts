/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItem, TreeItemCollapsibleState, commands } from 'vscode'
import { isCloud9 } from '../../extensionUtilities'

export abstract class AWSTreeNodeBase extends TreeItem {
    public readonly regionCode?: string

    public constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
        super(label, collapsibleState)
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return Promise.resolve([])
    }

    public refresh(): void {
        if (isCloud9()) {
            commands.executeCommand('aws.refreshAwsExplorer', true)
        } else {
            commands.executeCommand('aws.refreshAwsExplorerNode', this)
        }
    }
}
