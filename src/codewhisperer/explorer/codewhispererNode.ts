/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import * as CodeWhispererConstants from '../models/constants'
import {
    createEnableCodeSuggestionsNode,
    createAutoSuggestionsNode,
    createOpenReferenceLogNode,
    createSecurityScanNode,
    createLearnMore,
    createSsoSignIn,
    createFreeTierLimitMetNode,
} from './codewhispererChildrenNodes'
import { Commands } from '../../shared/vscode/commands2'
import { RootNode } from '../../awsexplorer/localExplorer'
import { isCloud9 } from '../../shared/extensionUtilities'
import { AuthUtil } from '../util/authUtil'
import { getCodeCatalystDevEnvId } from '../../shared/vscode/env'

export class CodeWhispererNode implements RootNode {
    private readonly isAvailable = getCodeCatalystDevEnvId() === undefined

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
        if (AuthUtil.instance.isUsingSavedConnection && AuthUtil.instance.isConnectionValid()) {
            return AuthUtil.instance.isEnterpriseSsoInUse()
                ? 'IAM Identity Center Connected'
                : 'AWS Builder ID Connected'
        }
        return ''
    }

    public getChildren() {
        if (!this.isAvailable) {
            return []
        }

        const termsAccepted = globals.context.globalState.get<boolean>(CodeWhispererConstants.termsAcceptedKey)
        const autoTriggerEnabled =
            globals.context.globalState.get<boolean>(CodeWhispererConstants.autoTriggerEnabledKey) || false

        if (isCloud9()) {
            if (termsAccepted) {
                return [createAutoSuggestionsNode(autoTriggerEnabled), createOpenReferenceLogNode()]
            } else {
                return [createLearnMore(), createEnableCodeSuggestionsNode()]
            }
        } else {
            const accessToken = this.getDescription()
            if (accessToken || AuthUtil.instance.isConnected()) {
                if (termsAccepted) {
                    if (this._showFreeTierLimitReachedNode) {
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
