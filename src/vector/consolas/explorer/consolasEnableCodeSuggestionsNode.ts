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
export class ConsolasEnableCodeSuggestionsNode extends AWSTreeNodeBase {
    public constructor(public readonly regionCode: string, public readonly parent: ConsolasNode) {
        super('Enable Consolas Code Suggestions', vscode.TreeItemCollapsibleState.None)
        this.tooltip = localize('AWS.explorerNode.enableConsolasNode.tooltip', 'Click to open the node')
        this.contextValue = 'awsConsolasEnableCodeSuggestionsNode'
        this.iconPath = {
            dark: vscode.Uri.file(globals.iconPaths.dark.run),
            light: vscode.Uri.file(globals.iconPaths.light.run),
        }
        this.command = {
            command: 'aws.consolas.enabledCodeSuggestions',
            title: ' Enable Consolas Code Suggestions',
            arguments: [this],
        }
    }
}
