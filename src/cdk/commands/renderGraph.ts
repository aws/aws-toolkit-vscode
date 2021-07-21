/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { ConstructNode } from '../explorer/nodes/constructNode'
import { showErrorWithLogs } from '../../shared/utilities/messages'
import { AslVisualizationCDK } from './aslVisualizationCDK'

/**
 * Renders a state graph of the state machine represented by the given node
 */
export async function renderGraphCommand(
    node: ConstructNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<AslVisualizationCDK | undefined> {
    getLogger().debug('Render graph called for: %O', node)

    const uniqueIdentifier = node.label
    const cdkOutPath = node.id?.replace(`/tree.json/${node.tooltip}`, ``)
    const stackName = node.tooltip?.replace(`/${node.label}`, ``)
    getLogger().info(`Rendering graph: ${uniqueIdentifier}`)

    try {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        const templatePath = cdkOutPath + `/${stackName}.template.json`
        const uri = vscode.Uri.file(templatePath);
        const textDocument = await vscode.workspace.openTextDocument(uri)
        const newVisualization = new AslVisualizationCDK(textDocument, templatePath, uniqueIdentifier)
        getLogger().info('Rendered graph: %O', uniqueIdentifier)
        window.showInformationMessage(localize('AWS.cdk.renderStateMachineGraph.success', 'Rendered graph {0}', uniqueIdentifier))

        return newVisualization
    } catch (e) {
        getLogger().error(`Failed to render graph ${uniqueIdentifier}: %O`, e)
        showErrorWithLogs(
            localize('AWS.cdk.renderStateMachineGraph.error.general', 'Failed to render graph {0}', uniqueIdentifier),
            window
        )
    }
}