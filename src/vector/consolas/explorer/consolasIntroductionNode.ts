/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { inspect } from 'util'
import { ConsolasNode } from './consolasNode'
import globals from '../../../shared/extensionGlobals'
import { localize } from '../../../shared/utilities/vsCodeUtils'

/**
 * Represents the group of all Consolas nodes.
 */
export class ConsolasIntroductionNode extends AWSTreeNodeBase {
    public constructor(public readonly regionCode: string, public readonly parent: ConsolasNode) {
        super('What is Consolas?', vscode.TreeItemCollapsibleState.None)
        this.tooltip = localize('AWS.explorerNode.introConsolasNode.tooltip', 'Click to open the node')
        this.contextValue = 'awsConsolaswelcomeNode'
        this.iconPath = {
            dark: vscode.Uri.file(globals.iconPaths.dark.question),
            light: vscode.Uri.file(globals.iconPaths.light.question),
        }

        this.command = {
            command: 'aws.consolas.introduction',
            title: 'Show Consolas Introduction Page',
            arguments: [this],
        }
    }

    public [inspect.custom](): string {
        return `Consolas-Things`
    }
}
