/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { AslVisualizationCDKManager } from './aslVisualizationCDKManager'
import { ConstructNode } from '../../../cdk/explorer/nodes/constructNode'
import { getLogger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { PreviewStateMachineCDKWizard } from '../../wizards/previewStateMachineCDKWizard'
import { Window } from '../../../shared/vscode/window'

/**
 * Renders a state graph of the state machine represented by the given node
 */
export async function renderStateMachineGraphCommand(
    globalStorage: vscode.Memento,
    visualizationManager: AslVisualizationCDKManager,
    node?: ConstructNode,
    window = Window.vscode()
): Promise<void> {
    if (!node) {
        const wizardResponse = await new PreviewStateMachineCDKWizard().run()

        if (
            wizardResponse &&
            wizardResponse.cdkApplication &&
            wizardResponse.stateMachine &&
            wizardResponse.stateMachine.stateMachineNode
        ) {
            node = wizardResponse.stateMachine.stateMachineNode
        }
    }

    if (!node) {
        return
    }

    const uniqueIdentifier = node.label

    try {
        visualizationManager.visualizeStateMachine(globalStorage, node)
        getLogger().info('Rendered graph: %O', uniqueIdentifier)
    } catch (e) {
        getLogger().error(`Failed to render graph ${uniqueIdentifier}: %O`, e)
        showViewLogsMessage(
            localize('AWS.cdk.renderStateMachineGraph.error.general', 'Failed to render graph {0}', uniqueIdentifier),
            window
        )
    }
}
