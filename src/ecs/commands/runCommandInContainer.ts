/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as picker from '../../shared/ui/picker'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { EcsContainerNode } from '../explorer/ecsContainerNode'
import { recordEcsRunExecuteCommand } from '../../shared/telemetry/telemetry.gen'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../../shared/settingsConfiguration'
import { extensionSettingsPrefix } from '../../shared/constants'
import { showOutputMessage, showViewLogsMessage } from '../../shared/utilities/messages'

import { getOrInstallCli } from '../../shared/utilities/cliUtils'
import globals from '../../shared/extensionGlobals'

export async function runCommandInContainer(
    node: EcsContainerNode,
    window = Window.vscode(),
    outputChannel = globals.outputChannel,
    settings: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
): Promise<void> {
    getLogger().debug('RunCommandInContainer called for: %O', node.containerName)
    let result: 'Succeeded' | 'Failed' | 'Cancelled' = 'Cancelled'

    try {
        // Check to see if there are any deployments in progress
        const activeDeployments = await deploymentsInProgress(node)
        if (activeDeployments.ACTIVE > 0 || activeDeployments.IN_PROGRESS > 0) {
            window.showWarningMessage(
                localize(
                    'AWS.command.ecs.runCommandInContainer.warnDeploymentInProgress',
                    'Service is currently deploying (ACTIVE={0}, IN_PROGRESS={1})',
                    activeDeployments.ACTIVE,
                    activeDeployments.IN_PROGRESS
                )
            )
        }

        // Quick pick to choose from the tasks in that service
        const quickPickItems = await getTaskItems(node)
        if (quickPickItems.length === 0) {
            window.showInformationMessage(
                localize(
                    'AWS.command.ecs.runCommandInContainer.noTasks',
                    'No running tasks for service: {0}',
                    node.serviceName
                )
            )
            return
        }

        let taskChoice

        if (quickPickItems.length === 1) {
            taskChoice = quickPickItems
        } else {
            const quickPick = picker.createQuickPick({
                options: {
                    title: localize('AWS.command.ecs.runCommandInContainer.chooseTask', 'Choose a task'),
                    ignoreFocusOut: true,
                },
                items: quickPickItems,
                buttons: [vscode.QuickInputButtons.Back],
            })

            taskChoice = await picker.promptUser({
                picker: quickPick,
                onDidTriggerButton: (button, resolve, reject) => {
                    if (button === vscode.QuickInputButtons.Back) {
                        resolve(undefined)
                    }
                },
            })
        }

        if (!taskChoice) {
            return
        }

        const task = taskChoice[0].label

        // Warn the user that commands may modify the container, give the option to dismiss future prompts
        const yesDontAskAgain = localize('AWS.message.prompt.yesDontAskAgain', "Yes, and don't ask again")
        if (await settings.isPromptEnabled('ecsRunCommand')) {
            const choice = await window.showInformationMessage(
                localize(
                    'AWS.command.ecs.runCommandInContainer.warnBeforeExecute',
                    'Command may modify the running container {0}. Are you sure?',
                    node.containerName
                ),
                { modal: true },
                localize('AWS.generic.response.yes', 'Yes'),
                yesDontAskAgain
            )
            if (choice === undefined) {
                getLogger().debug('ecs: Cancelled runCommandInContainer')
                return
            } else if (choice === yesDontAskAgain) {
                settings.disablePrompt('ecsRunCommand')
            }
        }

        //Get command line text from user to run in the container
        const command = await window.showInputBox({
            prompt: localize(
                'AWS.command.ecs.runCommandInContainer.prompt',
                'Enter the command to run in container: {0}',
                node.containerName
            ),
            placeHolder: localize('AWS.command.ecs.runCommandInContainer.placeHolder', 'Command to run'),
            ignoreFocusOut: true,
        })
        if (!command) {
            return
        }

        const ssmPlugin = await getOrInstallCli('session-manager-plugin', true, window, settings)

        if (!ssmPlugin) {
            result = 'Failed'
            throw Error('SSM Plugin not installed and cannot auto install')
        }

        const execCommand = await node.ecs.executeCommand(node.clusterArn, node.containerName, task, command)
        const args = [JSON.stringify(execCommand.session), node.ecs.regionCode, 'StartSession']
        const cp = await new ChildProcess(ssmPlugin, args).run()
        if (cp.exitCode !== 0) {
            result = 'Failed'
            showOutputMessage(cp.stderr, outputChannel)
            throw cp.error
        } else {
            result = 'Succeeded'
            showOutputMessage(cp.stdout, outputChannel)
        }
    } catch (error) {
        getLogger().error('Failed to execute command in container, %O', error)
        showViewLogsMessage(localize('AWS.ecs.runCommandInContainer.error', 'Failed to execute command in container.'))
    } finally {
        recordEcsRunExecuteCommand({ result: result, ecsExecuteCommandType: 'command' })
    }
}

async function deploymentsInProgress(node: EcsContainerNode): Promise<{ ACTIVE: number; IN_PROGRESS: number }> {
    let activeCount = 0
    let inProgressCount = 0
    const deployments = (await node.ecs.describeServices(node.clusterArn, [node.serviceName]))[0]?.deployments
    if (deployments) {
        for (const deployment of deployments) {
            if (deployment.status === 'ACTIVE') {
                activeCount++
            }
            if (deployment.rolloutState === 'IN_PROGRESS') {
                inProgressCount++
            }
        }
    }
    return { ACTIVE: activeCount, IN_PROGRESS: inProgressCount }
}

async function getTaskItems(node: EcsContainerNode): Promise<vscode.QuickPickItem[]> {
    const taskArns = await node.listTasks()
    // Filter for only 'Running' tasks
    const runningTasks = (await node.describeTasks(taskArns)).filter(t => {
        return t.lastStatus === 'RUNNING' && t.desiredStatus === 'RUNNING'
    })
    return runningTasks.map(task => {
        // The last 32 digits of the task arn is the task identifier
        return {
            label: task.taskArn!.substr(-32),
            detail: `Status: ${task.lastStatus}  Desired status: ${task.desiredStatus}`,
        }
    })
}
