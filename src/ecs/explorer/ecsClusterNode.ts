/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EcsNode } from './ecsNode'
// import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
// import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
// import { ext } from '../../shared/extensionGlobals'
// import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
// import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
// import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
// import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
// import { localize } from '../../shared/utilities/vsCodeUtils'
// import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
// import { Workspace } from '../../shared/vscode/workspace'
// import { inspect } from 'util'
// import { getLogger } from '../../shared/logger'
// import { EcsClient } from '../../shared/clients/ecsClient'

/**
 * Represents an ECS cluster
 */
export class EcsClusterNode extends AWSTreeNodeBase {
    // private readonly childLoader: ChildNodeLoader

    public constructor(
        public readonly clusterArn: string,
        public readonly parent: EcsNode,
        // private readonly ecsClient: EcsClient,
    ) {
        super(clusterArn, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = clusterArn
        // this.iconPath = {
        //     dark: vscode.Uri.file(ext.iconPaths.dark.s3),
        //     light: vscode.Uri.file(ext.iconPaths.light.s3),
        // }
        // this.contextValue = 'awsS3BucketNode'
        // this.childLoader = new ChildNodeLoader(this, token => this.loadPage(token))
    }
}