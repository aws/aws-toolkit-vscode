/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { SageMakerUnifiedStudioRootNode } from './sageMakerUnifiedStudioRootNode'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'

/**
 * Node representing the SageMaker Unified Studio authentication information
 */
export class SageMakerUnifiedStudioAuthInfoNode implements TreeNode {
    public readonly id = 'smusAuthInfoNode'
    public readonly resource = this
    private readonly authProvider: SmusAuthenticationProvider

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event

    constructor(private readonly parent?: SageMakerUnifiedStudioRootNode) {
        this.authProvider = SmusAuthenticationProvider.fromContext()

        // Subscribe to auth provider connection changes to refresh the node
        this.authProvider.onDidChange(() => {
            this.onDidChangeEmitter.fire()
        })
    }

    public getTreeItem(): vscode.TreeItem {
        // Use the cached authentication provider to check connection status
        const isConnected = this.authProvider.isConnected()
        const isValid = this.authProvider.isConnectionValid()

        // Get the domain ID and region from auth provider
        let domainId = 'Unknown'
        let region = 'Unknown'

        if (isConnected && this.authProvider.activeConnection) {
            domainId = this.authProvider.getDomainId() || 'Unknown'
            region = this.authProvider.getDomainRegion() || 'Unknown'
        }

        // Create display based on connection status
        let label: string
        let iconPath: vscode.ThemeIcon
        let tooltip: string

        if (isConnected && isValid) {
            label = `Domain: ${domainId}`
            iconPath = new vscode.ThemeIcon('key', new vscode.ThemeColor('charts.green'))
            tooltip = `Connected to SageMaker Unified Studio\nDomain ID: ${domainId}\nRegion: ${region}\nStatus: Connected`
        } else if (isConnected && !isValid) {
            label = `Domain: ${domainId} (Expired) - Click to reauthenticate`
            iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'))
            tooltip = `Connection to SageMaker Unified Studio has expired\nDomain ID: ${domainId}\nRegion: ${region}\nStatus: Expired - Click to reauthenticate`
        } else {
            label = 'Not Connected'
            iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'))
            tooltip = 'Not connected to SageMaker Unified Studio\nPlease sign in to access your projects'
        }

        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)

        // Add region as description (appears to the right) if connected
        if (isConnected) {
            item.description = region
        }

        // Add command for reauthentication when connection is expired
        if (isConnected && !isValid) {
            item.command = {
                command: 'aws.smus.reauthenticate',
                title: 'Reauthenticate',
                arguments: [this.authProvider.activeConnection],
            }
        }

        item.tooltip = tooltip
        item.contextValue = 'smusAuthInfo'
        item.iconPath = iconPath
        return item
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }
}
