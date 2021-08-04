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

export async function runCommandInContainer(node: EcsContainerNode, window = Window.vscode()): Promise<void> {
    getLogger().debug('RunCommandInContainer called for: %O', node)

    const verifyAwsCliResponse = await new ChildProcess(true, 'aws').run()
    if (verifyAwsCliResponse.exitCode !== 0) {
        window.showErrorMessage(
            localize('AWS.command.ecs.runCommandInContainer.noCliFound', 'Please install the AWS CLI before proceding')
        )
        throw new Error('The AWS CLI is not installed.')
    }

    const verifySsmPluginResponse = await new ChildProcess(true, 'session-manager-plugin').run()
    if (verifySsmPluginResponse.exitCode !== 0) {
        window.showErrorMessage(
            localize(
                'AWS.command.ecs.runCommandInContainer.noPluginFound',
                'Please install the SSM Session Manager plugin before proceding'
            )
        )
        throw new Error('The SSM Session Manager plugin is not installed.')
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

    // Warn the user that commands may modify the container, give the option to dismiss future prompts
    const configuration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    if (configuration.readSetting('ecs.warnRunCommand')) {
        const choice = await window.showInformationMessage(
            localize(
                'AWS.command.ecs.runCommandInContainer.warnBeforeExecute',
                'Command may modify the running container {0}. Are you sure?',
                node.continerName
            ),
            { modal: true },
            localize('AWS.generic.response.yes', 'Yes'),
            localize('AWS.command.ecs.runCommandInContainer.yesDoNotShowAgain', "Yes, and don't ask again")
        )
        if (choice === undefined) {
            getLogger().debug('ecs: Cancelled runCommandInContainer')
            return
        } else if (
            choice === localize('AWS.command.ecs.runCommandInContainer.yesDoNotShowAgain', "Yes, and don't ask again")
        ) {
            configuration.writeSetting('ecs.warnRunCommand', false, vscode.ConfigurationTarget.Global)
        }
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
    if (response.exitCode !== 0) {
        getLogger().error(response.stderr)
        recordEcsRunExecuteCommand({ result: 'Failed', ecsExecuteCommandType: 'command' })
    } else {
        recordEcsRunExecuteCommand({ result: 'Succeeded', ecsExecuteCommandType: 'command' })
    }
}
