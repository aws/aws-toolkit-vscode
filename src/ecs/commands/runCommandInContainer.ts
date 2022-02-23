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
import { recordEcsRunExecuteCommand } from '../../shared/telemetry/telemetry.gen'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../../shared/settingsConfiguration'
import { ecsRequiredPermissionsUrl, extensionSettingsPrefix, INSIGHTS_TIMESTAMP_FORMAT } from '../../shared/constants'
import { showOutputMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { getOrInstallCli } from '../../shared/utilities/cliUtils'
import { removeAnsi } from '../../shared/utilities/textUtilities'
import globals from '../../shared/extensionGlobals'
import { CommandWizard } from '../wizards/executeCommand'
import { IamClient } from '../../shared/clients/iamClient'
import { CancellationError } from '../../shared/utilities/timeoutUtils'

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
    settings: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
): Promise<void> {
    getLogger().debug('RunCommandInContainer called for: %O', node.containerName)
    let result: 'Succeeded' | 'Failed' | 'Cancelled' = 'Cancelled'
    let status: vscode.Disposable | undefined

    try {
        const iamClient = globals.toolkitClientBuilder.createIamClient(node.ecs.regionCode)
        if (await isMissingRequiredPermissions(node.taskRoleArn, iamClient)) {
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
                        vscode.env.openExternal(vscode.Uri.parse(ecsRequiredPermissionsUrl))
                    }
                })
            result = 'Failed'
            return
        }

        const wizard = new CommandWizard(node, await settings.isPromptEnabled('ecsRunCommand'))
        const response = await wizard.run()

        if (!response) {
            return
        }

        if (response.confirmation === 'suppress') {
            settings.disablePrompt('ecsRunCommand')
        }

        const ssmPlugin = await getOrInstallCli('session-manager-plugin', true, window, settings)

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
            }"  Running command: "${response.command}"`,
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
    } catch (error) {
        if (CancellationError.isUserCancelled(error)) {
            return
        }

        result = 'Failed'
        getLogger().error('Failed to execute command in container, %O', error)
        showViewLogsMessage(localize('AWS.ecs.runCommandInContainer.error', 'Failed to execute command in container.'))
    } finally {
        recordEcsRunExecuteCommand({ result: result, ecsExecuteCommandType: 'command' })
        status?.dispose()
    }
}
/**
 * Attempts to verify if the task role provided has the required SSM permissions to run ECS Exec
 * @param taskRoleArn
 * @param iamClient
 * @returns True if the permissions are missing from the Task role. False when all required permissions were found. Undefined when the task role is missing or the 'simulatePrincipalPolicy' call was unsuccessful.
 */
export async function isMissingRequiredPermissions(
    taskRoleArn: string | undefined,
    iamClient: IamClient
): Promise<boolean | undefined> {
    if (taskRoleArn === undefined) {
        return undefined
    }
    try {
        const permissionResponse = await iamClient.simulatePrincipalPolicy({
            PolicySourceArn: taskRoleArn,
            ActionNames: REQUIRED_SSM_PERMISSIONS,
        })
        if (!permissionResponse || !permissionResponse.EvaluationResults) {
            return undefined
        }
        for (const evalResult of permissionResponse.EvaluationResults) {
            if (evalResult.EvalDecision !== 'allowed') {
                return true
            }
        }
        return false
    } catch (error) {
        getLogger().error('Error during policy simulation. Skipping permissions check. Error: %O', error)
        return undefined
    }
}
