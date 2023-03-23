/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import * as CodeWhispererConstants from '../models/constants'
import {
    createAutoSuggestionsNode,
    createOpenReferenceLogNode,
    createSecurityScanNode,
    createLearnMore,
    createSsoSignIn,
    createFreeTierLimitMetNode,
    createReconnectNode,
} from './codewhispererChildrenNodes'
import { Commands } from '../../shared/vscode/commands2'
import { RootNode } from '../../awsexplorer/localExplorer'
import { isCloud9 } from '../../shared/extensionUtilities'
import { AuthUtil } from '../util/authUtil'

export class CodeWhispererNode implements RootNode {
    public readonly id = 'codewhisperer'
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    private readonly onDidChangeTreeItemEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeTreeItemEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    private readonly onDidChangeVisibilityEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event
    private _showFreeTierLimitReachedNode = false

    constructor() {}

    public getTreeItem() {
        if (!isCloud9()) {
            AuthUtil.instance.restore()
        }

        const item = new vscode.TreeItem('CodeWhisperer (Preview)')
        item.description = this.getDescription()
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = AuthUtil.instance.isUsingSavedConnection
            ? 'awsCodeWhispererNodeSaved'
            : 'awsCodeWhispererNode'

        return item
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
    }

    public refreshRootNode() {
        this.onDidChangeTreeItemEmitter.fire()
    }

    private getDescription(): string {
        const accessToken = globals.context.globalState.get<string | undefined>(CodeWhispererConstants.accessToken)
        if (accessToken) {
            return 'Access Token'
        }
        if (AuthUtil.instance.isConnectionValid()) {
            return AuthUtil.instance.isEnterpriseSsoInUse()
                ? 'IAM Identity Center Connected'
                : 'AWS Builder ID Connected'
        } else if (AuthUtil.instance.isConnectionExpired()) {
            return 'Expired Connection'
        }
        return ''
    }

    public getChildren() {
        const autoTriggerEnabled =
            globals.context.globalState.get<boolean>(CodeWhispererConstants.autoTriggerEnabledKey) || false

        if (isCloud9()) {
            return [createAutoSuggestionsNode(autoTriggerEnabled), createOpenReferenceLogNode()]
        } else {
            const isAccessToken = this.getDescription() === 'Access Token'
            if (isAccessToken || AuthUtil.instance.isConnected()) {
                if (AuthUtil.instance.isConnectionExpired()) {
                    return [createReconnectNode(), createLearnMore()]
                } else if (this._showFreeTierLimitReachedNode) {
                    return [createFreeTierLimitMetNode(), createSecurityScanNode(), createOpenReferenceLogNode()]
                } else {
                    return [
                        createAutoSuggestionsNode(autoTriggerEnabled),
                        createSecurityScanNode(),
                        createOpenReferenceLogNode(),
                    ]
                }
            } else {
                return [createSsoSignIn(), createLearnMore()]
            }
        }
    }

    public updateShowFreeTierLimitReachedNode(show: boolean) {
        this._showFreeTierLimitReachedNode = show
    }
}

export const codewhispererNode = new CodeWhispererNode()
export const refreshCodeWhisperer = Commands.register('aws.codeWhisperer.refresh', (showFreeTierLimitNode = false) => {
    codewhispererNode.updateShowFreeTierLimitReachedNode(showFreeTierLimitNode)
    codewhispererNode.refresh()
})

export const refreshCodeWhispererRootNode = Commands.register('aws.codeWhisperer.refreshRootNode', () => {
    codewhispererNode.refreshRootNode()
})
