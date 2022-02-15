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

// Required SSM permissions for the task IAM role, see https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html#ecs-exec-enabling-and-using
const required_ssm_permissions = [
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
        const taskHasPermissions = await checkRequiredPermissions(node)
        if (node.taskRoleArn === undefined || !taskHasPermissions) {
            const viewDocsItem = localize('AWS.generic.viewDocs', 'View Documentation')
            window
                .showErrorMessage(
                    localize(
                        'AWS.command.ecs.runCommandInContainer.missingPermissions',
                        'You may not have the permissions required for using the execute command. Please set up a Task Role with the required permissions and retry...'
                    ),
                    viewDocsItem
                )
                .then(selection => {
                    if (selection === viewDocsItem) {
                        vscode.env.openExternal(vscode.Uri.parse(ecsRequiredPermissionsUrl))
                    }
                })
            result = 'Cancelled'
            return
        }

        const wizard = new CommandWizard(node, await settings.isPromptEnabled('ecsRunCommand'))
        const response = await wizard.run()

        if (!response) {
            result = 'Cancelled'
            return
        }

        if (response.confirmation === 'suppress') {
            settings.disablePrompt('ecsRunCommand')
        }

        const ssmPlugin = await getOrInstallCli('session-manager-plugin', true, window, settings)

        if (!ssmPlugin) {
            result = 'Failed'
            throw Error('SSM Plugin not installed and cannot auto install')
        }

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

        const cp = await new ChildProcess(ssmPlugin, args, { logging: 'noparams' }).run({
            onStdout: text => {
                showOutputMessage(removeAnsi(text), outputChannel)
            },
            onStderr: text => {
                showOutputMessage(removeAnsi(text), outputChannel)
            },
        })

        if (cp.exitCode !== 0) {
            result = 'Failed'
            throw cp.error
        } else {
            result = 'Succeeded'
        }
    } catch (error) {
        getLogger().error('Failed to execute command in container, %O', error)
        showViewLogsMessage(localize('AWS.ecs.runCommandInContainer.error', 'Failed to execute command in container.'))
    } finally {
        recordEcsRunExecuteCommand({ result: result, ecsExecuteCommandType: 'command' })
        status?.dispose()
    }
}

async function checkRequiredPermissions(node: EcsContainerNode): Promise<boolean> {
    if (node.taskRoleArn === undefined) {
        return false
    }
    const iamClient = globals.toolkitClientBuilder.createIamClient(node.ecs.regionCode)
    const permissionResponse = (
        await iamClient.simulatePrincipalPolicy({
            PolicySourceArn: node.taskRoleArn,
            ActionNames: required_ssm_permissions,
        })
    ).EvaluationResults
    if (!permissionResponse) {
        return false
    }
    for (const evalResult of permissionResponse) {
        if (evalResult.EvalDecision !== 'allowed') {
            return false
        }
    }
    return true
}
