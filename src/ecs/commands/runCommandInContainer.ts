/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as moment from 'moment'
import * as vscode from 'vscode'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { EcsContainerNode } from '../explorer/ecsContainerNode'
import {
    ecsRequiredIamPermissionsUrl,
    ecsRequiredTaskPermissionsUrl,
    INSIGHTS_TIMESTAMP_FORMAT,
} from '../../shared/constants'
import { showOutputMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { getOrInstallCli } from '../../shared/utilities/cliUtils'
import { removeAnsi } from '../../shared/utilities/textUtilities'
import globals from '../../shared/extensionGlobals'
import { CommandWizard } from '../wizards/executeCommand'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { isCloud9 } from '../../shared/extensionUtilities'
import { PromptSettings } from '../../shared/settings'
import { viewDocs } from '../../shared/localizedText'
import { DefaultIamClient } from '../../shared/clients/iamClient'
import { telemetry } from '../../shared/telemetry/telemetry'

// Required SSM permissions for the task IAM role, see https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html#ecs-exec-enabling-and-using
const REQUIRED_SSM_PERMISSIONS = [
    'ssmmessages:CreateControlChannel',
    'ssmmessages:CreateDataChannel',
    'ssmmessages:OpenControlChannel',
    'ssmmessages:OpenDataChannel',
]

export async function runCommandInContainer(
    node: EcsContainerNode,
    window = Window.vscode(),
    outputChannel = globals.outputChannel,
    settings = PromptSettings.instance
): Promise<void> {
    getLogger().debug('RunCommandInContainer called for: %O', node.containerName)
    let result: 'Succeeded' | 'Failed' | 'Cancelled' = 'Cancelled'
    let status: vscode.Disposable | undefined

    try {
        const wizard = new CommandWizard(node, await settings.isPromptEnabled('ecsRunCommand'))
        const response = await wizard.run()

        if (!response) {
            return
        }

        if (response.confirmation === 'suppress') {
            settings.disablePrompt('ecsRunCommand')
        }

        const iamClient = new DefaultIamClient(node.ecs.regionCode)
        if (
            node.taskRoleArn !== undefined &&
            (await iamClient.hasRolePermissions({
                PolicySourceArn: node.taskRoleArn,
                ActionNames: REQUIRED_SSM_PERMISSIONS,
            })) === false
        ) {
            const viewDocsItem = localize('AWS.generic.viewDocs', 'View Documentation')
            window
                .showErrorMessage(
                    localize(
                        'AWS.command.ecs.runCommandInContainer.missingPermissions',
                        'Insufficient permissions to execute command. Configure a task role as described in the documentation.'
                    ),
                    viewDocsItem
                )
                .then(selection => {
                    if (selection === viewDocsItem) {
                        vscode.env.openExternal(vscode.Uri.parse(ecsRequiredTaskPermissionsUrl))
                    }
                })
            result = 'Failed'
            return
        }

        const ssmPlugin = await getOrInstallCli('session-manager-plugin', !isCloud9(), window)

        status = vscode.window.setStatusBarMessage(
            localize('AWS.command.ecs.statusBar.executing', 'ECS: Executing command...')
        )

        const execCommand = await node.ecs.executeCommand(
            node.parent.service.clusterArn!,
            node.containerName,
            response.task,
            response.command
        )
        const args = [JSON.stringify(execCommand.session), node.ecs.regionCode, 'StartSession']
        showOutputMessage(
            `${moment().format(INSIGHTS_TIMESTAMP_FORMAT)}:  Container: "${node.containerName}" Task ID: "${
                response.task
            }" Command: "${response.command}"`,
            outputChannel
        )

        await new ChildProcess(ssmPlugin, args, { logging: 'noparams' }).run({
            rejectOnErrorCode: true,
            onStdout: text => {
                showOutputMessage(removeAnsi(text), outputChannel)
            },
            onStderr: text => {
                showOutputMessage(removeAnsi(text), outputChannel)
            },
        })

        result = 'Succeeded'
    } catch (err) {
        const error = err as Error
        if (CancellationError.isUserCancelled(err)) {
            return
        }

        result = 'Failed'
        const failedMessage = localize('AWS.ecs.runCommandInContainer.error', 'Failed to execute command in container.')
        const missingPermissions = localize(
            'AWS.ecs.runCommandInContainer.missingPermissions',
            `Insufficient user role permissions for "Execute Command". See documentation for required permissions.`
        )
        getLogger().error('ecs: Failed to execute command in container, %O', err)
        if (error.name === 'AccessDeniedException') {
            showViewLogsMessage(missingPermissions, window, 'error', [viewDocs]).then(selection => {
                if (selection === viewDocs) {
                    vscode.env.openExternal(vscode.Uri.parse(ecsRequiredIamPermissionsUrl))
                }
            })
        } else {
            showViewLogsMessage(failedMessage)
        }
    } finally {
        telemetry.ecs_runExecuteCommand.emit({ result: result, ecsExecuteCommandType: 'command' })
        status?.dispose()
    }
}
