/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { PromptSettings } from '../../shared/settings'
import { telemetry } from '../../shared/telemetry/spans'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { EcsServiceNode } from '../explorer/ecsServiceNode'

export enum EcsRunCommandPrompt {
    Enable = 'ecsRunCommandEnable',
    Disable = 'ecsRunCommandDisable',
}

export async function updateEnableExecuteCommandFlag(
    node: EcsServiceNode,
    enable: boolean,
    window = Window.vscode(),
    commands = Commands.vscode(),
    settings = PromptSettings.instance
): Promise<void> {
    const yes = localize('AWS.generic.response.yes', 'Yes')
    const yesDontAskAgain = localize('AWS.message.prompt.yesDontAskAgain', "Yes, and don't ask again")
    const no = localize('AWS.generic.response.no', 'No')

    const prompt = enable ? EcsRunCommandPrompt.Enable : EcsRunCommandPrompt.Disable
    const hasExecEnabled = node.service.enableExecuteCommand

    const warningMessage = enable
        ? localize(
              'AWS.command.ecs.runCommandInContainer.warning.enableExecuteFlag',
              'Enabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\nAltering the state of resources while the Execute Command is enabled can lead to unpredictable results.\n Continue?'
          )
        : localize(
              'AWS.command.ecs.runCommandInContainer.warning.disableExecuteFlag',
              'Disabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\n Continue?'
          )
    const redundantActionMessage = enable
        ? localize('AWS.command.ecs.enableEcsExec.alreadyEnabled', 'ECS Exec is already enabled for this service')
        : localize('AWS.command.ecs.enableEcsExec.alreadyDisabled', 'ECS Exec is already disabled for this service')
    const updatingServiceMessage = enable
        ? localize('AWS.ecs.updateService.enable', 'Enabling ECS Exec for service: {0}', node.service.serviceName)
        : localize('AWS.ecs.updateService.disable', 'Disabling ECS Exec for service: {0}', node.service.serviceName)

    let result: 'Succeeded' | 'Failed' | 'Cancelled'
    if (enable === hasExecEnabled) {
        result = 'Cancelled'
        window.showInformationMessage(redundantActionMessage)
        telemetry.ecs_enableExecuteCommand.emit({ result: result, passive: false })
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
        result = 'Succeeded'
        node.parent.clearChildren()
        node.parent.refresh()
        window.showInformationMessage(updatingServiceMessage)
    } catch (e) {
        result = 'Failed'
        window.showErrorMessage((e as Error).message)
    } finally {
        if (enable) {
            telemetry.ecs_enableExecuteCommand.emit({ result: result!, passive: false })
        } else {
            telemetry.ecs_disableExecuteCommand.emit({ result: result!, passive: false })
        }
    }
}
