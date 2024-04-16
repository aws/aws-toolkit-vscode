/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Command, DeclaredCommand } from '../../shared/vscode/commands2'
import { codicon, getIcon } from '../../shared/icons'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'

const localize = nls.loadMessageBundle()

/**
 * Do not call this function directly, use the necessary equivalent command registered by the extensions:
 * - switchToAmazonQCommand, _aws.amazonq.focusView                   (for Amazon Q code)
 * - toolkitSwitchToAmazonQCommand, _aws.toolkit.amazonq.focusView    (for Toolkit code)
 */
export async function _switchToAmazonQ(signIn: boolean = false) {
    if (signIn) {
        await vscode.commands.executeCommand('setContext', 'aws.amazonq.showLoginView', true)
    } else {
        telemetry.ui_click.emit({
            elementId: 'amazonq_switchToQChat',
            passive: false,
        })
    }

    // Attempt to show both, in case something is wrong with the state of the webviews.
    // Only the active one will be shown.
    await vscode.commands.executeCommand('aws.AmazonQChatView.focus')
    await vscode.commands.executeCommand('aws.amazonq.AmazonCommonAuth.focus')
}

/**
 * Common nodes that can be used by mutliple UIs, e.g. status bar menu, explorer tree, etc.
 * Individual extensions may register their own commands for the nodes, so it must be passed in.
 *
 * TODO: If the Amazon Q explorer tree is removed, we should remove support for multiple commands
 * and only use the one registered in Amazon Q.
 */

export function switchToAmazonQNode(
    type: 'item',
    cmd: DeclaredCommand<typeof _switchToAmazonQ>
): DataQuickPickItem<'openChatPanel'>
export function switchToAmazonQNode(type: 'tree', cmd: DeclaredCommand<typeof _switchToAmazonQ>): TreeNode<Command>
export function switchToAmazonQNode(
    type: 'item' | 'tree',
    cmd: DeclaredCommand<typeof _switchToAmazonQ>
): DataQuickPickItem<'openChatPanel'> | TreeNode<Command>
export function switchToAmazonQNode(type: 'item' | 'tree', cmd: DeclaredCommand<typeof _switchToAmazonQ>): any {
    switch (type) {
        case 'tree':
            return cmd.build().asTreeNode({
                label: 'Open Chat Panel',
                iconPath: getIcon('vscode-comment'),
                contextValue: 'awsToAmazonQChatNode',
            })
        case 'item':
            return {
                data: 'openChatPanel',
                label: 'Open Chat Panel',
                iconPath: getIcon('vscode-comment'),
                onClick: () => cmd.execute(),
            } as DataQuickPickItem<'openChatPanel'>
    }
}

export function createSignIn(type: 'item', cmd: DeclaredCommand<typeof _switchToAmazonQ>): DataQuickPickItem<'signIn'>
export function createSignIn(type: 'tree', cmd: DeclaredCommand<typeof _switchToAmazonQ>): TreeNode<Command>
export function createSignIn(
    type: 'item' | 'tree',
    cmd: DeclaredCommand<typeof _switchToAmazonQ>
): DataQuickPickItem<'signIn'> | TreeNode<Command>
export function createSignIn(type: 'item' | 'tree', cmd: DeclaredCommand<typeof _switchToAmazonQ>): any {
    const label = localize('AWS.codewhisperer.signInNode.label', 'Sign in to get started')
    const icon = getIcon('vscode-account')

    switch (type) {
        case 'tree':
            return cmd.build(true).asTreeNode({
                label: label,
                iconPath: icon,
            })
        case 'item':
            return {
                data: 'signIn',
                label: codicon`${icon} ${label}`,
                onClick: () => cmd.execute(true),
            } as DataQuickPickItem<'signIn'>
    }
}
