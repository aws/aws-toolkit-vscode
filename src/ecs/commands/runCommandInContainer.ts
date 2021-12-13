/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as moment from 'moment'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { EcsContainerNode } from '../explorer/ecsContainerNode'
import { recordEcsRunExecuteCommand } from '../../shared/telemetry/telemetry.gen'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../../shared/settingsConfiguration'
import { extensionSettingsPrefix, LOCALIZED_DATE_FORMAT } from '../../shared/constants'
import { showOutputMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { getOrInstallCli } from '../../shared/utilities/cliUtils'
import { removeAnsi } from '../../shared/utilities/textUtilities'
import globals from '../../shared/extensionGlobals'
import { CommandWizard } from '../wizards/executeCommand'

export async function runCommandInContainer(
    node: EcsContainerNode,
    window = Window.vscode(),
    outputChannel = globals.outputChannel,
    settings: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
): Promise<void> {
    getLogger().debug('RunCommandInContainer called for: %O', node.containerName)
    let result: 'Succeeded' | 'Failed' | 'Cancelled' = 'Cancelled'

    try {
        const wizard = new CommandWizard(node, await settings.isPromptEnabled('ecsRunCommand'))
        const response = await wizard.run()

        if (!response) {
            result = 'Cancelled'
            return
        }

        if (response.confirmation === 'supress') {
            settings.disablePrompt('ecsRunCommand')
        }

        const ssmPlugin = await getOrInstallCli('session-manager-plugin', true, window, settings)

        if (!ssmPlugin) {
            result = 'Failed'
            throw Error('SSM Plugin not installed and cannot auto install')
        }

        const execCommand = await node.ecs.executeCommand(
            node.clusterArn,
            node.containerName,
            response.task,
            response.command
        )
        const args = [JSON.stringify(execCommand.session), node.ecs.regionCode, 'StartSession']
        showOutputMessage(
            `${moment().format(LOCALIZED_DATE_FORMAT)}  Running command: ${response.command}`,
            outputChannel
        )
        const cp = await new ChildProcess(ssmPlugin, args).run()
        if (cp.exitCode !== 0) {
            result = 'Failed'
            showOutputMessage(removeAnsi(cp.stderr), outputChannel)
            throw cp.error
        } else {
            result = 'Succeeded'
            showOutputMessage(removeAnsi(cp.stdout), outputChannel)
        }
    } catch (error) {
        getLogger().error('Failed to execute command in container, %O', error)
        showViewLogsMessage(localize('AWS.ecs.runCommandInContainer.error', 'Failed to execute command in container.'))
    } finally {
        recordEcsRunExecuteCommand({ result: result, ecsExecuteCommandType: 'command' })
    }
}
