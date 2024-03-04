/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { AslVisualizationCDKManager } from './aslVisualizationCDKManager'
import { PreviewStateMachineCDKWizard } from '../../wizards/previewStateMachineCDKWizard'
import { Commands } from '../../../shared/vscode/commands2'
import { isTreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { unboxTreeNode } from '../../../shared/treeview/utils'

function isLocationResource(obj: unknown): obj is { location: vscode.Uri } {
    return !!obj && typeof obj === 'object' && (obj as any).location instanceof vscode.Uri
}

/**
 * Renders a state graph of the state machine.
 *
 * If given a {@link TreeNode}, it should contain a resource with a URI pointing to the `tree.json`.
 * URIs should have a fragment with the resource path in order to locate it within the CFN template.
 */
export const renderCdkStateMachineGraph = Commands.declare(
    'aws.cdk.renderStateMachineGraph',
    (memento: vscode.Memento, manager: AslVisualizationCDKManager) => async (input?: unknown) => {
        const resource = isTreeNode(input) ? unboxTreeNode(input, isLocationResource) : undefined
        const resourceUri = resource?.location ?? (await new PreviewStateMachineCDKWizard().run())?.resource.location

        if (!resourceUri) {
            return
        }

        await manager.visualizeStateMachine(memento, resourceUri)
    }
)
