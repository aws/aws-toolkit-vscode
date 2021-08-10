/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { extensionSettingsPrefix } from '../../shared/constants'
import { DefaultSettingsConfiguration } from '../../shared/settingsConfiguration'
import { recordEcsDisableExecuteCommand, recordEcsEnableExecuteCommand } from '../../shared/telemetry/telemetry.gen'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { EcsServiceNode } from '../explorer/ecsServiceNode'

export async function updateEnableExecuteCommandFlag(
    node: EcsServiceNode,
    enable: boolean,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    const hasExecEnabled = node.service.enableExecuteCommand

    const enableWarning = localize(
        'AWS.command.ecs.runCommandInContainer.warning.enableExecuteFlag',
        'Enabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\nAltering the state of resources while the Execute Command is enabled can lead to unpredictable results.\n Continue?'
    )
    const disableWarning = localize(
        'AWS.command.ecs.runCommandInContainer.warning.disableExecuteFlag',
        'Disabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\n Continue?'
    )
    const yes = localize('AWS.generic.response.yes', 'Yes')
    const yesDontAskAgain = localize('AWS.message.prompt.yesDontAskAgain', "Yes, and don't ask again")
    const no = localize('AWS.generic.response.no', 'No')

    const configuration = new DefaultSettingsConfiguration(extensionSettingsPrefix)

    if (enable) {
        if (hasExecEnabled) {
            window.showInformationMessage(
                localize('AWS.command.ecs.enableEcsExec.alreadyEnabled', 'ECS Exec is already enabled for this service')
            )
            return
        }
        if (configuration.readSetting('ecs.warnBeforeEnablingExcecuteCommand')) {
            const choice = await window.showWarningMessage(enableWarning, yes, yesDontAskAgain, no)
            if (choice === undefined || choice === 'No') {
                return
            } else if (choice === yesDontAskAgain) {
                configuration.writeSetting(
                    'ecs.warnBeforeEnablingExcecuteCommand',
                    false,
                    vscode.ConfigurationTarget.Global
                )
            }
        }
        await node.ecs.updateService(node.service.clusterArn!, node.name, true)
        recordEcsEnableExecuteCommand({ result: 'Succeeded', passive: false })
        node.parent.clearChildren()
        commands.execute('aws.refreshAwsExplorer', node.parent)
        return
    }
    if (!hasExecEnabled) {
        window.showInformationMessage(
            localize('AWS.command.ecs.enableEcsExec.alreadyDisabled', 'ECS Exec is already disabled for this service')
        )
        return
    }

    if (configuration.readSetting('ecs.warnBeforeDisablingExecuteCommand')) {
        const choice = await window.showWarningMessage(disableWarning, yes, yesDontAskAgain, no)
        if (choice === undefined || choice === 'No') {
            return
        } else if (choice === yesDontAskAgain) {
            configuration.writeSetting(
                'ecs.warnBeforeDisablingExecuteCommand',
                false,
                vscode.ConfigurationTarget.Global
            )
        }
    }
    await node.ecs.updateService(node.service.clusterArn!, node.name, false)
    recordEcsDisableExecuteCommand({ result: 'Succeeded', passive: false })

    node.parent.clearChildren()
    commands.execute('aws.refreshAwsExplorer', node.parent)
}
