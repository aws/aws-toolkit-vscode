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
export class ConsolasResumeAutoSuggestionsNode extends AWSTreeNodeBase {
    public constructor(public readonly regionCode: string, public readonly parent: ConsolasNode) {
        super('Resume auto-suggestions', vscode.TreeItemCollapsibleState.None)
        this.command = {
            command: 'aws.consolas.resumeCodeSuggestion',
            title: localize('AWS.explorerNode.resumeConsolasNode.tooltip', 'Resume auto-suggestions'),
            arguments: [this],
        }
        this.contextValue = 'awsConsolasResumeAutoSuggestionsNode'
        this.iconPath = {
            dark: vscode.Uri.file(globals.iconPaths.dark.run),
            light: vscode.Uri.file(globals.iconPaths.light.run),
        }
    }
}
