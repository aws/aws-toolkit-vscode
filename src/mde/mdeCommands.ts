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
import { showMessageWithCancel, showViewLogsMessage } from '../shared/utilities/messages'
import { Commands } from '../shared/vscode/commands'
import { Window } from '../shared/vscode/window'
import { MdeRootNode } from './mdeRootNode'
import { isExtensionInstalledMsg } from '../shared/utilities/vsCodeUtils'
import { Timeout, waitTimeout, waitUntil } from '../shared/utilities/timeoutUtils'

const localize = nls.loadMessageBundle()

/**
 * Best-effort attempt to start an MDE given an ID, showing a progress notifcation with a cancel button
 * TODO: may combine this progress stuff into some larger construct
 *
 * The cancel button does not abort the start, but rather alerts any callers that any operations that rely
 * on the MDE starting should not progress.
 *
 * @returns the environment on success, undefined otherwise
 */
export async function startMde(env: Pick<mde.MdeEnvironment, 'id'>): Promise<mde.MdeEnvironment | undefined> {
    // hard-coded timeout for now
    const TIMEOUT_LENGTH = 120000

    const timeout = new Timeout(TIMEOUT_LENGTH)
    const progress = await showMessageWithCancel(localize('AWS.mde.startMde.message', 'MDE'), timeout)
    progress.report({ message: localize('AWS.mde.startMde.checking', 'checking status...') })

    const pollMde = waitUntil(
        async () => {
            // technically this will continue to be called until it reaches its own timeout, need a better way to 'cancel' a `waitUntil`
            if (timeout.completed) {
                return
            }

            const resp = await ext.mde.getEnvironmentMetadata({ environmentId: env.id })

            if (resp?.status === 'STOPPED') {
                progress.report({ message: localize('AWS.mde.startMde.stopStart', 'resuming environment...') })
                await ext.mde.startEnvironment({ environmentId: env.id })
            } else {
                progress.report({
                    message: localize('AWS.mde.startMde.starting', 'waiting for environment to start...'),
                })
            }

            return resp?.status === 'RUNNING' ? resp : undefined
        },
        { interval: 5000, timeout: TIMEOUT_LENGTH, truthy: true }
    )

    return waitTimeout(pollMde, timeout, {
        onExpire: () => (
            Window.vscode().showErrorMessage(
                localize('AWS.mde.startFailed', 'Timed-out while waiting for MDE to start')
            ),
            undefined
        ),
        onCancel: () => undefined,
    })
}

export async function mdeConnectCommand(env: Pick<mde.MdeEnvironment, 'id'>): Promise<void> {
    if (!isExtensionInstalledMsg('ms-vscode-remote.remote-ssh', 'Remote SSH', 'Connecting to MDE')) {
        return
    }

    const vsc = `${vscode.env.appRoot}/bin/code`
    const cmd = new ChildProcess(true, vsc, undefined, '--folder-uri', `vscode-remote://ssh-remote+${env.id}/home/`)

    // Note: `await` is intentionally not used.
    cmd.run(
        (stdout: string) => {
            getLogger().verbose(`MDE connect: ${env.id}: ${stdout}`)
        },
        (stderr: string) => {
            getLogger().verbose(`MDE connect: ${env.id}: ${stderr}`)
        }
    )
}

export async function mdeCreateCommand(
    node?: MdeRootNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<mde.MdeEnvironment | undefined> {
    const d = new Date()
    const dateYear = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d)
    const dateMonth = new Intl.DateTimeFormat('en', { month: '2-digit' }).format(d)
    const dateDay = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(d)
    const dateStr = `${dateYear}-${dateMonth}-${dateDay}`

    getLogger().debug('MDE: mdeCreateCommand called on node: %O', node)
    const label = `created-${dateStr}`

    try {
        const env = ext.mde.createEnvironment({
            instanceType: 'mde.large',
            // Persistent storage in Gb (0,16,32,64), 0 = no persistence.
            persistentStorage: { sizeInGiB: 0 },
            sourceCode: [{ uri: 'https://github.com/neovim/neovim.git', branch: 'master' }],
            // definition: {
            //     shellImage: `"{"\"shellImage\"": "\"mcr.microsoft.com/vscode/devcontainers/go\""}"`,
            // },
            tags: {
                label: '', // Label = "tag with no value".
            },
            // instanceType: ...  // TODO?
            // ideRuntimes: ...  // TODO?
        })

        getLogger().info('MDE: created environment: %O', env)
        // TODO: MDE telemetry
        // recordEcrCreateRepository({ result: 'Succeeded' })
        return env
    } catch (e) {
        getLogger().error('MDE: failed to create %O: %O', label, e)
        showViewLogsMessage(localize('AWS.mde.createFailed', 'Failed to create MDE environment: {0}', label), window)
        // TODO: MDE telemetry
        // recordEcrCreateRepository({ result: 'Failed' })
    } finally {
        if (node !== undefined) {
            await commands.execute('aws.refreshAwsExplorerNode', node)
        } else {
            await commands.execute('aws.refreshAwsExplorer', true)
        }
    }
}
