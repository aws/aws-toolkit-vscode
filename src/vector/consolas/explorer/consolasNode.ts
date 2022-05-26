/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { ConsolasConstants } from '../models/constants'
import {
    createEnableCodeSuggestionsNode,
    createIntroductionNode,
    createPauseAutoSuggestionsNode,
    createResumeAutoSuggestionsNode,
    createOpenReferenceLogNode,
} from './consolasChildrenNodes'
import { Commands } from '../../../shared/vscode/commands2'
import { RootNode } from '../../../awsexplorer/localExplorer'
import { Experiments } from '../../../shared/settings'
export class ConsolasNode implements RootNode {
    public readonly id = 'consolas'
    public readonly treeItem = this.createTreeItem()
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    private readonly onDidChangeVisibilityEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event

    constructor() {
        Experiments.instance.onDidChange(({ key }) => {
            if (key === 'Consolas') {
                this.onDidChangeVisibilityEmitter.fire()
            }
        })
    }

    private createTreeItem() {
        const item = new vscode.TreeItem('Consolas (Preview)')
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = 'awsConsolasNode'

        return item
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
    }

    public getChildren() {
        if (globals.context.globalState.get<boolean>(ConsolasConstants.termsAcceptedKey)) {
            if (globals.context.globalState.get<boolean>(ConsolasConstants.autoTriggerEnabledKey)) {
                return [createPauseAutoSuggestionsNode(), createOpenReferenceLogNode()]
            }
            return [createResumeAutoSuggestionsNode(), createOpenReferenceLogNode()]
        } else {
            return [createIntroductionNode(), createEnableCodeSuggestionsNode()]
        }
    }

    public async canShow(): Promise<boolean> {
        return await Experiments.instance.isExperimentEnabled('Consolas')
    }
}

export const consolasNode = new ConsolasNode()
export const refreshConsolas = Commands.register('aws.consolas.refresh', consolasNode.refresh.bind(consolasNode))
