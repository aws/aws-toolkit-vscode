/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import PreviewStateMachineCDKWizard from '../wizards/previewStateMachineCDKWizard'
import { AslVisualizationCDKManager } from './aslVisualizationCDKManager'
import { getLogger, Logger } from '../../shared/logger'
import { renderGraphCommand } from './renderGraph'

export async function previewCDKStateMachineFromCommandPalette(context: vscode.Memento, aslVisualizationCDKManager: AslVisualizationCDKManager) {
    const logger: Logger = getLogger()

    const wizardResponse = await new PreviewStateMachineCDKWizard().run()

    if (wizardResponse && wizardResponse.cdkApplication && wizardResponse.stateMachine && wizardResponse.stateMachine.stateMachineNode) {
        logger.debug(
            `User selected the ${wizardResponse.stateMachine} state machine of ${wizardResponse.cdkApplication.label} CDK application`
        )
        renderGraphCommand(wizardResponse.stateMachine.stateMachineNode, context, aslVisualizationCDKManager)
    }
}