/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Command, Commands, placeholder } from '../../shared/vscode/commands2'
import { codicon, getIcon } from '../../shared/icons'
import { installAmazonQExtension, reconnect } from '../../codewhisperer/commands/basicCommands'
import { amazonQHelpUrl } from '../../shared/constants'
import { cwTreeNodeSource } from '../../codewhisperer/commands/types'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { globals } from '../../shared'
import { amazonQDismissedKey } from '../../codewhisperer/models/constants'

const localize = nls.loadMessageBundle()

export const learnMoreAmazonQCommand = Commands.declare('aws.toolkit.amazonq.learnMore', () => () => {
    void vscode.env.openExternal(vscode.Uri.parse(amazonQHelpUrl))
})

export const qExtensionPageCommand = Commands.declare('aws.toolkit.amazonq.extensionpage', () => () => {
    void vscode.env.openExternal(vscode.Uri.parse(`vscode:extension/${VSCODE_EXTENSION_ID.amazonq}`))
})

export const dismissQTree = Commands.declare('aws.toolkit.amazonq.dismiss', () => async () => {
    await globals.context.globalState.update(amazonQDismissedKey, true)
    await vscode.commands.executeCommand('setContext', amazonQDismissedKey, true)
})
// Learn more button of Amazon Q now opens the Amazon Q marketplace page.
export const createLearnMoreNode = () =>
    qExtensionPageCommand.build().asTreeNode({
        label: localize('AWS.amazonq.learnMore', 'Learn More About Amazon Q (Preview)'),
        iconPath: getIcon('vscode-question'),
        contextValue: 'awsAmazonQLearnMoreNode',
    })

export const switchToAmazonQCommand = Commands.declare(
    '_aws.amazonq.focusView',
    () =>
        async (signIn: boolean = false) => {
            telemetry.ui_click.emit({
                elementId: 'amazonq_switchToQChat',
                passive: false,
            })
            if (signIn) {
                await vscode.commands.executeCommand('setContext', 'aws.amazonq.showLoginView', true)
            }

            // Attempt to show both, in case something is wrong with the state of the tree. Only the active
            // one will be shown. This way, even if the state of the tree is broken, the buttons still take
            // you to Amazon Q.
            await vscode.commands.executeCommand('aws.AmazonQChatView.focus')
            await vscode.commands.executeCommand('aws.amazonq.AmazonCommonAuth.focus')
        }
)

export function switchToAmazonQNode(type: 'item'): DataQuickPickItem<'openChatPanel'>
export function switchToAmazonQNode(type: 'tree'): TreeNode<Command>
export function switchToAmazonQNode(type: 'item' | 'tree'): DataQuickPickItem<'openChatPanel'> | TreeNode<Command>
export function switchToAmazonQNode(type: 'item' | 'tree'): any {
    switch (type) {
        case 'tree':
            return switchToAmazonQCommand.build().asTreeNode({
                label: 'Open Chat Panel',
                iconPath: getIcon('vscode-comment'),
                contextValue: 'awsToAmazonQChatNode',
            })
        case 'item':
            return {
                data: 'openChatPanel',
                label: 'Open Chat Panel',
                iconPath: getIcon('vscode-comment'),
                onClick: () => switchToAmazonQCommand.execute(),
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
            return switchToAmazonQCommand.build(true).asTreeNode({
                label: label,
                iconPath: icon,
            })
        case 'item':
            return {
                data: 'signIn',
                label: codicon`${icon} ${label}`,
                onClick: () => switchToAmazonQCommand.execute(true),
            } as DataQuickPickItem<'signIn'>
    }
}

export function createInstallQNode() {
    return installAmazonQExtension.build().asTreeNode({
        label: 'Install the Amazon Q Extension', // TODO: localize
        iconPath: getIcon('vscode-extensions'),
    })
}

export function createDismissNode() {
    return dismissQTree.build().asTreeNode({
        label: 'Dismiss', // TODO: localize
        iconPath: getIcon('vscode-close'),
    })
}

/*
 * This node is meant to be displayed when the user's active connection is missing scopes required for Amazon Q.
 * For example, users with active CodeWhisperer connections who updates to a toolkit version with Amazon Q (Preview)
 * will be missing these scopes.
 */
export const enableAmazonQNode = () =>
    // Simply trigger re-auth to obtain the proper scopes- same functionality as if requested in the chat window.
    reconnect.build(placeholder, cwTreeNodeSource, true).asTreeNode({
        label: localize('AWS.amazonq.enable', 'Enable'),
        iconPath: getIcon('vscode-debug-start'),
        contextValue: 'awsEnableAmazonQ',
    })
