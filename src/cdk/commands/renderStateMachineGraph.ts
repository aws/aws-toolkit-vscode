/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { ConstructNode } from '../explorer/nodes/constructNode'
import { AslVisualizationCDKManager } from './aslVisualizationCDKManager'
import { getLogger } from '../../shared/logger'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Window } from '../../shared/vscode/window'

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
