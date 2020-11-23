/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AsyncLock from 'async-lock'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { recordSamDetect } from '../../../shared/telemetry/telemetry'
import { extensionSettingsPrefix, samAboutInstallUrl } from '../../constants'
import { DefaultSettingsConfiguration } from '../../settingsConfiguration'
import { DefaultSamCliConfiguration, SamCliConfiguration } from './samCliConfiguration'
import { DefaultSamCliLocationProvider } from './samCliLocator'

const localize = nls.loadMessageBundle()
const lock = new AsyncLock()

const learnMore = localize('AWS.samcli.userChoice.visit.install.url', 'Get SAM CLI')
const browseToSamCli = localize('AWS.samcli.userChoice.browse', 'Locate SAM CLI...')
const settingsUpdated = localize('AWS.samcli.detect.settings.updated', 'Settings updated.')

/**
 * Searches for SAM CLI on the system, updates the user setting if
 * `passive=false`, and shows a message if `showMessage=true`.
 *
 * @param args.passive  Controls whether user setting is updated. Also sets the
 * telemetry "passive" flag.
 * @param args.showMessage true: always show message, false: never show
 * message (except if SAM was not found)
 */
export async function detectSamCli(args: { passive: boolean; showMessage: boolean | undefined }): Promise<void> {
    await lock.acquire('detect SAM CLI', async () => {
        const samCliConfig = new DefaultSamCliConfiguration(
            new DefaultSettingsConfiguration(extensionSettingsPrefix),
            new DefaultSamCliLocationProvider()
        )

        if (!args.passive) {
            // Force getOrDetectSamCli() to search for SAM CLI.
            await samCliConfig.setSamCliLocation('')
        }

        const sam = await samCliConfig.getOrDetectSamCli()
        const notFound = sam.path === ''

        // Update the user setting.
        //
        // NOTE: We must NOT _passively_ auto-update the user setting, that
        // conflicts with VSCode "remote": each VSCode instance will update the
        // setting based on its local environment, but the user settings are
        // shared across VSCode instances...
        if (!args.passive && sam.autoDetected) {
            await samCliConfig.setSamCliLocation(sam.path)
        }

        if (args.showMessage !== false || notFound) {
            if (notFound) {
                notifyUserSamCliNotDetected(samCliConfig)
            } else if (args.showMessage === true) {
                vscode.window.showInformationMessage(getSettingsUpdatedMessage(sam.path ?? '?'))
            }
        }

        if (!args.passive) {
            recordSamDetect({ result: sam.path ? 'Succeeded' : 'Failed' })
        }
    })
}

function notifyUserSamCliNotDetected(samCliConfig: SamCliConfiguration): void {
    // inform the user, but don't wait for this to complete
    vscode.window
        .showErrorMessage(
            localize(
                'AWS.samcli.error.notFound',
                'Cannot find SAM CLI, which is required to create new Serverless Applications and debug them locally. If you have already installed the SAM CLI, update your User Settings by locating it.'
            ),
            learnMore,
            browseToSamCli
        )
        .then(async userResponse => {
            if (userResponse === learnMore) {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(samAboutInstallUrl))
            } else if (userResponse === browseToSamCli) {
                const location: vscode.Uri[] | undefined = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    openLabel: 'Apply location to Settings',
                })

                if (!!location && location.length === 1) {
                    const path: string = location[0].fsPath
                    await samCliConfig.setSamCliLocation(path)
                    vscode.window.showInformationMessage(getSettingsUpdatedMessage(path))
                }
            }
        })
}

function getSettingsUpdatedMessage(location: string): string {
    const configuredLocation = localize('AWS.samcli.configured.location', 'SAM CLI Location: {0}', location)

    return `${settingsUpdated} ${configuredLocation}`
}
