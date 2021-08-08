/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { getLogger } from '../../shared/logger'
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
        'Enabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\nAltering the state of resources while the Execute Command is enabled can lead to unpredictable results.\n Do you wish to continue?'
    )
    const disableWarning = localize(
        'AWS.command.ecs.runCommandInContainer.warning.disableExecuteFlag',
        'Disabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\n Do you wish to continue?'
    )
    const yes = localize('AWS.generic.response.yes', 'Yes')
    const yesDontAskAgain = localize('AWS.message.prompt.yesDontAskAgain', "Yes, and don't ask again")
    const no = localize('AWS.generic.response.no', 'No')

    if (enable) {
        if (hasExecEnabled) {
            window.showInformationMessage(
                localize('AWS.command.ecs.enableEcsExec.alreadyEnabled', 'ECS Exec is already enabled for this service')
            )
        } else {
            const proceed = await window.showWarningMessage(enableWarning, yes, yesDontAskAgain, no)
            if (proceed === undefined || proceed === 'No') {
                return
            }
        }
        // disable
    } else {
        if (hasExecEnabled) {
            const proceed = await window.showWarningMessage(disableWarning, yes, yesDontAskAgain, no)
            if (proceed === undefined || proceed === 'No') {
                return
            }
        } else {
            window.showInformationMessage(
                localize(
                    'AWS.command.ecs.enableEcsExec.alreadyDisabled',
                    'ECS Exec is already disabled for this service'
                )
            )
            return
        }
    }

    // Warn the user this will redeploy the entire service
    const choice = await window.showInformationMessage(
        localize(
            'AWS.command.ecs.enableEcsExec.warnWillRedeploy',
            'This action will update the service and redeploy its running tasks. Do you wish to continue?'
        ),
        { modal: true },
        localize('AWS.generic.response.yes', 'Yes')
    )

    if (choice === undefined) {
        getLogger().debug('ecs: Enable/Disable ECS Exec cancelled')
        return
    } else {
        if (enable) {
            await node.ecs.updateService(node.service.clusterArn!, node.name, true)
            recordEcsEnableExecuteCommand({ result: 'Succeeded', passive: false })
        } else {
            await node.ecs.updateService(node.service.clusterArn!, node.name, false)
            recordEcsDisableExecuteCommand({ result: 'Succeeded', passive: false })
        }

        commands.execute('aws.refreshAwsExplorer')
    }
}
