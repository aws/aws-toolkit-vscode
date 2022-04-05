/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { ConsolasNode } from './consolasNode'
import globals from '../../../shared/extensionGlobals'
import { localize } from '../../../shared/utilities/vsCodeUtils'

/**
 * Represents the group of all Consolas nodes.
 */
export class ConsolasPauseAutoSuggestionsNode extends AWSTreeNodeBase {
    public constructor(public readonly regionCode: string, public readonly parent: ConsolasNode) {
        super('Pause auto-suggestions', vscode.TreeItemCollapsibleState.None)
        this.command = {
            command: 'aws.consolas.pauseCodeSuggestion',
            title: localize('AWS.explorerNode.pauseConsolasNode.tooltip', 'Pause auto-suggestions'),
            arguments: [this],
        }
        this.contextValue = 'awsConsolasPauseAutoSuggestionsNode'
        this.iconPath = {
            dark: vscode.Uri.file(globals.iconPaths.dark.pause),
            light: vscode.Uri.file(globals.iconPaths.light.pause),
        }
    }
}
