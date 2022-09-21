/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as moment from 'moment'
import * as vscode from 'vscode'
import { DefaultIamClient } from '../shared/clients/iamClient'
import { INSIGHTS_TIMESTAMP_FORMAT } from '../shared/constants'
import globals from '../shared/extensionGlobals'
import { PromptSettings } from '../shared/settings'
import { ChildProcess } from '../shared/utilities/childProcess'
import { showMessageWithCancel, showOutputMessage } from '../shared/utilities/messages'
import { removeAnsi } from '../shared/utilities/textUtilities'
import { CancellationError, Timeout } from '../shared/utilities/timeoutUtils'
import { Commands } from '../shared/vscode/commands2'
import { checkPermissionsForSsm } from './util'
import { CommandWizard, CommandWizardState } from './wizards/executeCommand'
import { isUserCancelledError, ToolkitError } from '../shared/errors'
import { getResourceFromTreeNode } from '../shared/treeview/utils'
import { Container, Service } from './model'
import { Instance } from '../shared/utilities/typeConstructors'
import { telemetry } from '../shared/telemetry/telemetry'

async function runCommandWizard(
    param?: unknown,
    command?: string
): Promise<CommandWizardState & { container: Container }> {
    const container = getResourceFromTreeNode(param, Instance(Container))

    const wizard = new CommandWizard(container, await PromptSettings.instance.isPromptEnabled('ecsRunCommand'), command)
    const response = await wizard.run()

    if (!response) {
        throw new CancellationError('user')
    }

    if (response.confirmation === 'suppress') {
        await PromptSettings.instance.disablePrompt('ecsRunCommand')
    }

    await checkPermissionsForSsm(new DefaultIamClient(globals.regionProvider.defaultRegionId), {
        taskRoleArn: container.description.taskRoleArn!,
    })

    return { container, ...response }
}

export enum EcsRunCommandPrompt {
    Enable = 'ecsRunCommandEnable',
    Disable = 'ecsRunCommandDisable',
}

export async function toggleExecuteCommandFlag(
    service: Service,
    window = vscode.window,
    settings = PromptSettings.instance
): Promise<void> {
    const yes = localize('AWS.generic.response.yes', 'Yes')
    const yesDontAskAgain = localize('AWS.message.prompt.yesDontAskAgain', "Yes, don't ask again")
    const no = localize('AWS.generic.response.no', 'No')

    const isNotEnabled = service.description.enableExecuteCommand ?? false
    const prompt = isNotEnabled ? EcsRunCommandPrompt.Enable : EcsRunCommandPrompt.Disable

    const warningMessage = isNotEnabled
        ? localize(
              'AWS.command.ecs.runCommandInContainer.warning.enableExecuteFlag',
              'Enabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\nAltering the state of resources while the Execute Command is enabled can lead to unpredictable results.\n Continue?'
          )
        : localize(
              'AWS.command.ecs.runCommandInContainer.warning.disableExecuteFlag',
              'Disabling command execution will change the state of resources in your AWS account, including but not limited to stopping and restarting the service.\n Continue?'
          )

    if (await settings.isPromptEnabled(prompt)) {
        const choice = await window.showWarningMessage(warningMessage, yes, yesDontAskAgain, no)
        if (choice === undefined || choice === no) {
            throw new CancellationError('user')
        } else if (choice === yesDontAskAgain) {
            settings.disablePrompt(prompt)
        }
    }

    await service.toggleExecuteCommand()
}

export const runCommandInContainer = Commands.register('aws.ecs.runCommandInContainer', (obj?: unknown) => {
    return telemetry.ecs_runExecuteCommand.run(async span => {
        span.record({ ecsExecuteCommandType: 'command' })

        const { container, task, command } = await runCommandWizard(obj)
        const timeout = new Timeout(600000)
        showMessageWithCancel('Running command...', timeout)

        try {
            const { path, args } = await container.prepareCommandForTask(command, task)
            showOutputMessage(
                `${moment().format(INSIGHTS_TIMESTAMP_FORMAT)}:  Container: "${
                    container.description.name
                }" Task ID: "${task}" Command: "${command}"`,
                globals.outputChannel
            )

            await new ChildProcess(path, args, { logging: 'noparams' }).run({
                timeout,
                rejectOnError: true,
                rejectOnErrorCode: true,
                // TODO: `showOutputMessage` should not be writing to the logs...
                onStdout: text => {
                    showOutputMessage(removeAnsi(text), globals.outputChannel)
                },
                onStderr: text => {
                    showOutputMessage(removeAnsi(text), globals.outputChannel)
                },
            })
        } catch (err) {
            if (isUserCancelledError(err)) {
                showOutputMessage('Cancelled command execution', globals.outputChannel)
            }

            const failedMessage = localize(
                'AWS.ecs.runCommandInContainer.error',
                'Failed to execute command in container.'
            )
            throw ToolkitError.chain(err, failedMessage)
        } finally {
            timeout.dispose()
        }
    })
})

export const openTaskInTerminal = Commands.register('aws.ecs.openTaskInTerminal', (obj?: unknown) => {
    return telemetry.ecs_runExecuteCommand.run(async span => {
        span.record({ ecsExecuteCommandType: 'shell' })

        const { container, task, command } = await runCommandWizard(obj, '/usr/bin/env bash')

        try {
            const { path, args } = await container.prepareCommandForTask(command, task)
            const terminal = vscode.window.createTerminal({
                name: `${container.description.name}/${task}`,
                shellPath: path,
                shellArgs: args,
            })

            terminal.show()
        } catch (err) {
            throw ToolkitError.chain(
                err,
                localize('AWS.ecs.openTaskInTerminal.error', 'Failed to open task in terminal.')
            )
        }
    })
})
