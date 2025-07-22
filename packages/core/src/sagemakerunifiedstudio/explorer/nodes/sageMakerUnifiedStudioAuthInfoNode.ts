/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { DataZoneClient } from '../../shared/client/datazoneClient'

/**
 * Node representing the SageMaker Unified Studio authentication information
 */
export class SageMakerUnifiedStudioAuthInfoNode implements TreeNode {
    public readonly id = 'smusAuthInfoNode'
    public readonly resource = {}

    constructor() {}

    public getTreeItem(): vscode.TreeItem {
        // Get the domain ID and region from DataZoneClient
        const datazoneClient = DataZoneClient.getInstance()
        const domainId = datazoneClient.getDomainId() || 'Unknown'
        const region = datazoneClient.getRegion() || 'Unknown'

        // Create a more concise display
        const item = new vscode.TreeItem(`Domain: ${domainId}`, vscode.TreeItemCollapsibleState.None)

        // Add region as description (appears to the right)
        item.description = `Region: ${region}`

        // Add full information as tooltip
        item.tooltip = `Connected to SageMaker Unified Studio\nDomain ID: ${domainId}\nRegion: ${region}`

        item.contextValue = 'smusAuthInfo'
        item.iconPath = new vscode.ThemeIcon('key')
        return item
    }

    public getParent(): undefined {
        return undefined
    }
}
