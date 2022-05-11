/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { showIntroduction } from '../commands/treeNodeCommands'

export const createIntroductionNode = () =>
    showIntroduction.build().asTreeNode({
        label: localize('AWS.explorerNode.consolasIntroductionNode.label', 'What is Consolas?'),
        iconPath: {
            dark: vscode.Uri.file(globals.iconPaths.dark.question),
            light: vscode.Uri.file(globals.iconPaths.light.question),
        },
        tooltip: localize('AWS.explorerNode.consolasIntroductionNode.tooltip', 'Click to open the node'),
        contextValue: 'awsConsolasIntroductionNode',
    })
