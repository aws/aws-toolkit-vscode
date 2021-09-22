/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { extensionSettingsPrefix } from '../../shared/constants'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../../shared/settingsConfiguration'
import { recordEcsDisableExecuteCommand, recordEcsEnableExecuteCommand } from '../../shared/telemetry/telemetry.gen'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { EcsServiceNode } from '../explorer/ecsServiceNode'

export async function updateEnableExecuteCommandFlag(
    node: EcsServiceNode,
    enable: boolean,
    window = Window.vscode(),
    commands = Commands.vscode(),
    settings: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
): Promise<void> {    
    const enableWarning = localize(
        'AWS.command.ecs.runCommandInContainer.warning.enableExecuteFlag',
        'Enabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\nAltering the state of resources while the Execute Command is enabled can lead to unpredictable results.\n Continue?'
    )
    const disableWarning = localize(
        'AWS.command.ecs.runCommandInContainer.warning.disableExecuteFlag',
        'Disabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\n Continue?'
    )
    const alreadyEnabled = localize('AWS.command.ecs.enableEcsExec.alreadyEnabled', 'ECS Exec is already enabled for this service')
    const alreadyDisabled = localize('AWS.command.ecs.enableEcsExec.alreadyDisabled', 'ECS Exec is already disabled for this service')
    const yes = localize('AWS.generic.response.yes', 'Yes')
    const yesDontAskAgain = localize('AWS.message.prompt.yesDontAskAgain', "Yes, and don't ask again")
    const no = localize('AWS.generic.response.no', 'No')
    
    const prompt = enable ? 'ecsRunCommandEnable' : 'ecsRunCommandDisable'
    const hasExecEnabled = node.service.enableExecuteCommand

    const warningMessage = enable ? enableWarning : disableWarning
    const redundentActionMessage = enable ? alreadyEnabled : alreadyDisabled

    if(enable === hasExecEnabled) {
        window.showInformationMessage(redundentActionMessage)
        return
    }

    try {
        if (await settings.isPromptEnabled(prompt)) {
            const choice = await window.showWarningMessage(warningMessage, yes, yesDontAskAgain, no)
            if (choice === undefined || choice === no) {
                return
            } else if (choice === yesDontAskAgain) {
                settings.disablePrompt(prompt)
            }
        }
        await node.ecs.updateService(node.service.clusterArn!, node.name, enable)
        if(enable) {
            recordEcsEnableExecuteCommand({ result: 'Succeeded', passive: false })
        } else {
            recordEcsDisableExecuteCommand({ result: 'Succeeded', passive: false })
        }
        node.parent.clearChildren()
        commands.execute('aws.refreshAwsExplorerNode', node.parent)
        return
    } catch (e) {
        if(enable) {
            recordEcsEnableExecuteCommand({ result: 'Failed', passive: false })
        } else {
            recordEcsDisableExecuteCommand({ result: 'Failed', passive: false })
        }

        window.showErrorMessage((e as Error).message)
    }

}
