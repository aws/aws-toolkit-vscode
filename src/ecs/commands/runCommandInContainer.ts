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
import { extensionSettingsPrefix, INSIGHTS_TIMESTAMP_FORMAT } from '../../shared/constants'
import { showOutputMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { getOrInstallCli } from '../../shared/utilities/cliUtils'
import { removeAnsi } from '../../shared/utilities/textUtilities'
import globals from '../../shared/extensionGlobals'
import { CommandWizard } from '../wizards/executeCommand'
import { CancellationError } from '../../shared/utilities/timeoutUtils'

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
        const wizard = new CommandWizard(node, await settings.isPromptEnabled('ecsRunCommand'))
        const response = await wizard.run()

        if (!response) {
            return
        }

        if (response.confirmation === 'suppress') {
            settings.disablePrompt('ecsRunCommand')
        }

        const ssmPlugin = await getOrInstallCli('session-manager-plugin', true, window, settings)

        status = vscode.window.setStatusBarMessage(
            localize('AWS.command.ecs.statusBar.executing', 'ECS: Executing command...')
        )

        const execCommand = await node.ecs.executeCommand(
            node.clusterArn,
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

        await new ChildProcess(ssmPlugin, args, { logging: 'noparams' }).run({
            rejectOnErrorCode: true,
            onStdout: text => {
                showOutputMessage(removeAnsi(text), outputChannel)
            },
            onStderr: text => {
                showOutputMessage(removeAnsi(text), outputChannel)
            },
        })

        result = 'Succeeded'
    } catch (error) {
        if (CancellationError.isUserCancelled(error)) {
            return
        }

        result = 'Failed'
        getLogger().error('Failed to execute command in container, %O', error)
        showViewLogsMessage(localize('AWS.ecs.runCommandInContainer.error', 'Failed to execute command in container.'))
    } finally {
        recordEcsRunExecuteCommand({ result: result, ecsExecuteCommandType: 'command' })
        status?.dispose()
    }
}
