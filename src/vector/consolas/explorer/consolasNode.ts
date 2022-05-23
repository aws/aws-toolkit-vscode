/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { makeChildrenNodes } from '../../../shared/treeview/utils'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import globals from '../../../shared/extensionGlobals'
import { ConsolasConstants } from '../models/constants'
import {
    createEnableCodeSuggestionsNode,
    createIntroductionNode,
    createPauseAutoSuggestionsNode,
    createResumeAutoSuggestionsNode,
    createOpenReferenceLogNode,
} from './consolasChildrenNodes'

/**
 * An AWS Explorer node representing Consolas.
 *
 * Contains consolas code suggestions feature.
 */
export class ConsolasNode extends AWSTreeNodeBase {
    public constructor() {
        super('Consolas (Preview)', vscode.TreeItemCollapsibleState.Collapsed)
        vscode.commands.executeCommand(
            'setContext',
            ConsolasConstants.termsAcceptedKey,
            globals.context.globalState.get<boolean>(ConsolasConstants.termsAcceptedKey)
        )
        this.contextValue = 'awsConsolasNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                if (globals.context.globalState.get<boolean>(ConsolasConstants.termsAcceptedKey)) {
                    if (globals.context.globalState.get<boolean>(ConsolasConstants.autoTriggerEnabledKey)) {
                        return [createPauseAutoSuggestionsNode(), createOpenReferenceLogNode()]
                    }
                    return [createResumeAutoSuggestionsNode(), createOpenReferenceLogNode()]
                } else {
                    return [createIntroductionNode(), createEnableCodeSuggestionsNode()]
                }
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.consolasNode', '[No Consolas node found]')),
        })
    }
}
