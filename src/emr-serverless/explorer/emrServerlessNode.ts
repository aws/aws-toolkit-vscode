/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { EmrServerlessClient } from '../../shared/clients/emrServerlessClient'
import { EmrServerlessApplicationNode } from './emrServerlessApplicationNode'

export class EmrServerlessNode extends AWSTreeNodeBase {
    public constructor(private readonly emrserverless: EmrServerlessClient) {
        super('EMR Serverless', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsEmrServerlessNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await toArrayAsync(this.emrserverless.listApplications())

                return response.map(item => new EmrServerlessApplicationNode(this, this.emrserverless, item))
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.emrserverless.noApplications', '[No applications found]')
                ),
        })
    }
}
