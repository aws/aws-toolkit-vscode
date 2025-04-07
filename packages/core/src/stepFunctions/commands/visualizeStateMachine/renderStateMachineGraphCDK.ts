/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { getLogger } from '../../../shared/logger/logger'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { isTreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { unboxTreeNode } from '../../../shared/treeview/utils'
import { Commands } from '../../../shared/vscode/commands2'
import { PreviewStateMachineCDKWizard } from '../../wizards/previewStateMachineCDKWizard'
import { WorkflowMode } from '../../workflowStudio/types'
import { WorkflowStudioEditorProvider } from '../../workflowStudio/workflowStudioEditorProvider'
import { getStateMachineDefinitionFromCfnTemplate } from './getStateMachineDefinitionFromCfnTemplate'

const localize = nls.loadMessageBundle()

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
    () => async (input?: unknown) => {
        const resource = isTreeNode(input) ? unboxTreeNode(input, isLocationResource) : undefined
        const resourceUri = resource?.location ?? (await new PreviewStateMachineCDKWizard().run())?.resource.location

        if (!resourceUri) {
            return
        }
        const logger = getLogger('stepfunctions')
        try {
            telemetry.ui_click.emit({
                elementId: 'stepfunctions_renderCDKStateMachineGraph',
            })
            const [appName, resourceName] = resourceUri.fragment.split('/')
            const cdkOutPath = vscode.Uri.joinPath(resourceUri, '..')
            const templateUri = vscode.Uri.joinPath(cdkOutPath, `${appName}.template.json`)
            const definitionString = getStateMachineDefinitionFromCfnTemplate(resourceName, templateUri.fsPath)

            if (definitionString) {
                // Append stateMachineName and Readonly WorkflowMode to templateUri
                // to instruct WorkflowStudioEditorProvider to open in Readonly mode and get ASL definition from CloudFormation template
                const query = `statemachineName=${encodeURIComponent(resourceName)}&workflowMode=${encodeURIComponent(WorkflowMode.Readonly)}`
                const wfsUriWithTemplateInfo = templateUri.with({ query })
                await WorkflowStudioEditorProvider.openWithWorkflowStudio(wfsUriWithTemplateInfo)
            } else {
                void vscode.window.showErrorMessage(
                    localize(
                        'AWS.stepfunctions.visualisation.errors.rendering',
                        'There was an error rendering State Machine Graph, check logs for details.'
                    )
                )
                logger.error('Unable to extract state machine definition string from template.json file.')
            }
        } catch (err) {
            void vscode.window.showErrorMessage(
                localize(
                    'AWS.stepfunctions.visualisation.errors.rendering',
                    'There was an error rendering State Machine Graph, check logs for details.'
                )
            )

            logger.error(`Unexpected exception: %s`, err)
        }
    }
)
