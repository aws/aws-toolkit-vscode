/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as picker from '../../shared/ui/picker'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { EcsContainerNode } from '../explorer/ecsContainerNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { recordEcsRunExecuteCommand } from '../../shared/telemetry/telemetry.gen'

export async function runCommandInContainer(node: EcsContainerNode, window = Window.vscode()): Promise<void> {
    getLogger().debug('RunCommandInContainer called for: %O', node)

    const verifySSMPluginResponse = await new ChildProcess(true, 'session-manager-plugin').run()
    if (!verifySSMPluginResponse.stdout.startsWith('The Session Manager plugin was installed successfully')) {
        throw new Error('The Session Manager plugin for the AWS CLI is not installed.')
    }

    //Quick pick to choose from the tasks in that service
    const quickPickItems = (await node.listTasks()).map(task => {
        // The last 32 digits of the task arn is the task identifier
        return { label: task.substr(-32) }
    })
    if (quickPickItems.length === 0) {
        window.showInformationMessage(
            localize(
                'AWS.command.ecs.runCommandInContainer.noTasks',
                'There are no running tasks for the service: {0}',
                node.serviceName
            )
        )
        return
    }

    const quickPick = picker.createQuickPick({
        options: {
            title: 'Choose a task',
            ignoreFocusOut: true,
        },
        items: quickPickItems,
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
        prompt: localize('AWS.command.ecs.runCommandInContainer.prompt', 'Enter the command to run in container'),
        placeHolder: localize('AWS.command.ecs.runCommandInContainer.placeHolder', 'Command to run'),
        ignoreFocusOut: true,
    })
    if (!command) {
        return
    }

    const response = await new ChildProcess(
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
        node.continerName,
        '--command',
        command,
        '--interactive'
    ).run()

    getLogger().info(response.stdout)
    if (response.exitCode !== 0 || response.stderr) {
        getLogger().error(response.stderr)
        recordEcsRunExecuteCommand({ result: 'Failed', ecsExecuteCommandType: 'command' })
    } else {
        recordEcsRunExecuteCommand({ result: 'Succeeded', ecsExecuteCommandType: 'command' })
    }
}
