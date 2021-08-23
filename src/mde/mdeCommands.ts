/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as mde from '../shared/clients/mdeClient'
import * as nls from 'vscode-nls'
import { ext } from '../shared/extensionGlobals'
import { getLogger } from '../shared/logger/logger'
import { ChildProcess } from '../shared/utilities/childProcess'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { Commands } from '../shared/vscode/commands'
import { Window } from '../shared/vscode/window'
import { MdeRootNode } from './mdeRootNode'
import { isExtensionInstalledMsg } from '../shared/utilities/vsCodeUtils'

const localize = nls.loadMessageBundle()

export async function mdeConnectCommand(env: mde.MdeEnvironment): Promise<void> {
    if (!isExtensionInstalledMsg('ms-vscode-remote.remote-ssh', 'Remote SSH', 'Connecting to MDE')) {
        return
    }

    const vsc = `${vscode.env.appRoot}/bin/code`
    const cmd = new ChildProcess(
        true,
        vsc,
        undefined,
        '--folder-uri',
        `vscode-remote://ssh-remote+${env.environmentId}/home/`
    )

    // Note: `await` is intentionally not used.
    cmd.run(
        (stdout: string) => {
            getLogger().verbose(`MDE connect: ${env.environmentId}: ${stdout}`)
        },
        (stderr: string) => {
            getLogger().verbose(`MDE connect: ${env.environmentId}: ${stderr}`)
        }
    )
}

export async function mdeCreateCommand(
    node: MdeRootNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    const d = new Date()
    const dateYear = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d)
    const dateMonth = new Intl.DateTimeFormat('en', { month: '2-digit' }).format(d)
    const dateDay = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(d)
    const dateStr = `${dateYear}-${dateMonth}-${dateDay}`

    getLogger().debug('MDE: mdeCreateCommand called on node: %O', node)
    const label = `created-${dateStr}`

    try {
        const env = ext.mde.createEnvironment({
            userId: 'TestRole',
            // definition: {
            //     shellImage: `"{"\"shellImage\"": "\"mcr.microsoft.com/vscode/devcontainers/go\""}"`,
            // },
            tags: {
                '': label, // Label = "tag with empty key".
            },
            // instanceType: ...  // TODO?
            // ideRuntimes: ...  // TODO?
        })

        getLogger().info('MDE: created environment: %O', env)
        // TODO: MDE telemetry
        // recordEcrCreateRepository({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error('MDE: failed to create %O: %O', label, e)
        showViewLogsMessage(localize('AWS.mde.createFailed', 'Failed to create MDE environment: {0}', label), window)
        // TODO: MDE telemetry
        // recordEcrCreateRepository({ result: 'Failed' })
    } finally {
        await commands.execute('aws.refreshAwsExplorerNode', node)
    }
}
