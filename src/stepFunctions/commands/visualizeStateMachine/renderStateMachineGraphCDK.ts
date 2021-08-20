/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { AslVisualizationCDKManager } from './aslVisualizationCDKManager'
import { ConstructNode } from '../../../cdk/explorer/nodes/constructNode'
import { getLogger, Logger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { PreviewStateMachineCDKWizard } from '../../wizards/previewStateMachineCDKWizard'
import { Window } from '../../../shared/vscode/window'

/**
 * Renders a state graph of the state machine represented by the given node
 */
export async function renderStateMachineGraphCommand(
    node: ConstructNode,
    globalStorage: vscode.Memento,
    visualizationManager: AslVisualizationCDKManager,
    window = Window.vscode()
): Promise<void> {
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

export async function previewCDKStateMachineFromCommandPalette(
    globalStorage: vscode.Memento,
    aslVisualizationCDKManager: AslVisualizationCDKManager
) {
    const logger: Logger = getLogger()

    const wizardResponse = await new PreviewStateMachineCDKWizard().run()

    if (
        wizardResponse &&
        wizardResponse.cdkApplication &&
        wizardResponse.stateMachine &&
        wizardResponse.stateMachine.stateMachineNode
    ) {
        logger.debug(
            `User selected the ${wizardResponse.stateMachine} state machine of ${wizardResponse.cdkApplication.label} CDK application`
        )
        renderStateMachineGraphCommand(
            wizardResponse.stateMachine.stateMachineNode,
            globalStorage,
            aslVisualizationCDKManager
        )
    }
}
