/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { SageMakerUnifiedStudioRootNode } from './sageMakerUnifiedStudioRootNode'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { SmusIamConnection } from '../../auth/model'
import { getContext } from '../../../shared/vscode/setContext'
import { loadSharedConfigFiles } from '@smithy/shared-ini-file-loader'

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

    public async getTreeItem(): Promise<vscode.TreeItem> {
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
        let description: string | undefined

        // Get profile name for express mode
        const isExpressMode = getContext('aws.smus.isExpressMode')
        let profileName: string | undefined
        if (isExpressMode) {
            const activeConnection = this.authProvider.activeConnection!
            const { configFile } = await loadSharedConfigFiles()
            profileName =
                (activeConnection as SmusIamConnection).profileName || (configFile['default'] ? 'default' : undefined)
        }

        if (isConnected && isValid) {
            // Get session name and role ARN dynamically for IAM connections in express mode
            let sessionName: string | undefined
            let roleArn: string | undefined
            if (isExpressMode) {
                sessionName = await this.authProvider.getSessionName()
                roleArn = await this.authProvider.getRoleArn()
            }

            // Format label with session name if available
            const sessionSuffix = sessionName ? ` (session: ${sessionName})` : ''
            label = isExpressMode ? `Connected with profile: ${profileName}${sessionSuffix}` : `Domain: ${domainId}`
            iconPath = new vscode.ThemeIcon('key', new vscode.ThemeColor('charts.green'))

            // Add role ARN and session name to tooltip if available (role ARN before session)
            const roleArnTooltip = roleArn ? `\nRole ARN: ${roleArn}` : ''
            const sessionTooltip = sessionName ? `\nSession: ${sessionName}` : ''
            tooltip = `Connected to SageMaker Unified Studio\n${isExpressMode ? `Profile: ${profileName}` : `Domain ID: ${domainId}`}\nRegion: ${region}${roleArnTooltip}${sessionTooltip}\nStatus: Connected`
            description = region
        } else if (isConnected && !isValid) {
            label = isExpressMode
                ? `Profile: ${profileName} (Expired) - Click to reauthenticate`
                : `Domain: ${domainId} (Expired) - Click to reauthenticate`
            iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'))
            tooltip = `Connection to SageMaker Unified Studio has expired\n${isExpressMode ? `Profile: ${profileName}` : `Domain ID: ${domainId}`}\nRegion: ${region}\nStatus: Expired - Click to reauthenticate`
            description = region
        } else {
            label = 'Not Connected'
            iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'))
            tooltip = 'Not connected to SageMaker Unified Studio\nPlease sign in to access your projects'
            description = undefined
        }

        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)

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
        item.description = description
        return item
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }
}
