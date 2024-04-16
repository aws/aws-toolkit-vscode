/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Command, Commands } from '../../shared/vscode/commands2'
import { codicon, getIcon } from '../../shared/icons'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { CodeWhispererSource } from '../../codewhisperer/commands/types'

const localize = nls.loadMessageBundle()

/**
 * Do not call this function directly, use the necessary equivalent commands below,
 * which areregistered by the Amazon Q extension.
 * - switchToAmazonQCommand
 * - switchToAmazonQSignInCommand
 */
export async function _switchToAmazonQ(signIn: boolean) {
    if (signIn) {
        await vscode.commands.executeCommand('setContext', 'aws.amazonq.showLoginView', true)
        telemetry.ui_click.emit({
            elementId: 'amazonq_switchToQSignIn',
            passive: false,
        })
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

export const switchToAmazonQCommand = Commands.declare(
    { id: '_aws.amazonq.focusView', compositeKey: { 0: 'source' } },
    () =>
        (source: CodeWhispererSource, signIn: boolean = false) =>
            _switchToAmazonQ(false)
)

export const switchToAmazonQSignInCommand = Commands.declare(
    { id: '_aws.amazonq.signIn.focusView', compositeKey: { 0: 'source' } },
    () => (source: CodeWhispererSource) => _switchToAmazonQ(true)
)

/**
 * Common nodes that can be used by mutliple UIs, e.g. status bar menu, explorer tree, etc.
 * Individual extensions may register their own commands for the nodes, so it must be passed in.
 *
 * TODO: If the Amazon Q explorer tree is removed, we should remove support for multiple commands
 * and only use the one registered in Amazon Q.
 */

export function switchToAmazonQNode(type: 'item'): DataQuickPickItem<'openChatPanel'>
export function switchToAmazonQNode(type: 'tree'): TreeNode<Command>
export function switchToAmazonQNode(type: 'item' | 'tree'): DataQuickPickItem<'openChatPanel'> | TreeNode<Command>
export function switchToAmazonQNode(type: 'item' | 'tree'): any {
    switch (type) {
        case 'tree':
            return switchToAmazonQCommand.build('codewhispererTreeNode').asTreeNode({
                label: 'Open Chat Panel',
                iconPath: getIcon('vscode-comment'),
                contextValue: 'awsToAmazonQChatNode',
            })
        case 'item':
            return {
                data: 'openChatPanel',
                label: 'Open Chat Panel',
                iconPath: getIcon('vscode-comment'),
                onClick: () => switchToAmazonQCommand.execute('codewhispererQuickPick'),
            } as DataQuickPickItem<'openChatPanel'>
    }
}

export function createSignIn(type: 'item'): DataQuickPickItem<'signIn'>
export function createSignIn(type: 'tree'): TreeNode<Command>
export function createSignIn(type: 'item' | 'tree'): DataQuickPickItem<'signIn'> | TreeNode<Command>
export function createSignIn(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.signInNode.label', 'Sign in to get started')
    const icon = getIcon('vscode-account')

    switch (type) {
        case 'tree':
            return switchToAmazonQSignInCommand.build('codewhispererTreeNode').asTreeNode({
                label: label,
                iconPath: icon,
            })
        case 'item':
            return {
                data: 'signIn',
                label: codicon`${icon} ${label}`,
                onClick: () => switchToAmazonQSignInCommand.execute('codewhispererQuickPick'),
            } as DataQuickPickItem<'signIn'>
    }
}
