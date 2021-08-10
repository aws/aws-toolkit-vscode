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
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'
import { extensionSettingsPrefix } from '../../shared/constants'
import { getIdeProperties } from '../../shared/extensionUtilities'
import { showOutputMessage } from '../../shared/utilities/messages'
import { ext } from '../../shared/extensionGlobals'

export async function runCommandInContainer(
    node: EcsContainerNode,
    window = Window.vscode(),
    outputChannel = ext.outputChannel
): Promise<void> {
    getLogger().debug('RunCommandInContainer called for: %O', node.containerName)

    if (!(await verifyCliAndPlugin(window))) {
        return
    }

    // Check to see if there are any deployments in process
    const deployments = (await node.ecs.describeServices(node.clusterArn, [node.serviceName]))[0].deployments
    if (deployments) {
        for (let i = 0; i < deployments.length; i++) {
            if (deployments[i].status === 'ACTIVE' || deployments[i].rolloutState === 'IN_PROGRESS') {
                window.showWarningMessage(
                    localize(
                        'AWS.command.ecs.runCommandInContainer.warnDeploymentInProgress',
                        'A deployment for this service may still be in progress. Not all containers may be running.'
                    )
                )
            }
            break
        }
    }

    // Quick pick to choose from the tasks in that service
    const taskArns = await node.listTasks()
    // Filter for only 'Running' tasks
    const runningTasks = (await node.describeTasks(taskArns)).filter(t => {
        return t.lastStatus === 'RUNNING' && t.desiredStatus === 'RUNNING'
    })
    const quickPickItems: vscode.QuickPickItem[] = runningTasks.map(task => {
        // The last 32 digits of the task arn is the task identifier
        return {
            label: task.taskArn!.substr(-32),
            detail: `Status: ${task.lastStatus}  Desired status: ${task.desiredStatus}`,
        }
    })
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

    const quickPick = picker.createQuickPick({
        options: {
            title: localize('AWS.command.ecs.runCommandInContainer.chooseTask', 'Choose a task'),
            ignoreFocusOut: true,
        },
        items: quickPickItems,
        buttons: [vscode.QuickInputButtons.Back],
    })

    let taskChoice

    if (quickPickItems.length === 1) {
        taskChoice = quickPickItems
    } else {
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

    // Warn the user that commands may modify the container, give the option to dismiss future prompts
    const yesDontAskAgain = localize('AWS.message.prompt.yesDontAskAgain', "Yes, and don't ask again")
    const configuration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    if (configuration.readSetting('ecs.warnRunCommand')) {
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
            configuration.writeSetting('ecs.warnRunCommand', false, vscode.ConfigurationTarget.Global)
        }
    }

    const cmd = new ChildProcess(
        true,
        'aws',
        undefined,
        'ecs',
        'execute-command',
        '--cluster',
        node.clusterArn,
        '--task',
        task,
        '--container',
        node.containerName,
        '--command',
        command,
        '--interactive'
    )
    const processResponse = await cmd.run()

    if (processResponse.exitCode !== 0) {
        showOutputMessage(processResponse.stderr, outputChannel)
        getLogger().error('ECS command failed: %O: %O', cmd, processResponse.stderr)
        recordEcsRunExecuteCommand({ result: 'Failed', ecsExecuteCommandType: 'command' })
    } else {
        showOutputMessage(processResponse.stdout, outputChannel)
        recordEcsRunExecuteCommand({ result: 'Succeeded', ecsExecuteCommandType: 'command' })
    }
}

async function verifyCliAndPlugin(window: Window): Promise<boolean> {
    const verifyAwsCliResponse = await new ChildProcess(true, 'aws', undefined, '--version').run()
    if (verifyAwsCliResponse.exitCode !== 0) {
        const noCli = localize(
            'AWS.command.ecs.runCommandInContainer.noCliFound',
            'This feature requires the {0} CLI (aws) to be installed and available on your $PATH',
            getIdeProperties().company
        )
        window.showErrorMessage(noCli)
        return false
    }

    const verifySsmPluginResponse = await new ChildProcess(true, 'session-manager-plugin').run()
    if (verifySsmPluginResponse.exitCode !== 0) {
        window.showErrorMessage(
            localize(
                'AWS.command.ecs.runCommandInContainer.noPluginFound',
                'This feature requires the SSM Session Manager plugin (session-manager-plugin) to be installed and available on your $PATH'
            )
        )
        return false
    }
    return true
}
