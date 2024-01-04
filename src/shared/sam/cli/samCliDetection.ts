/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { samInstallUrl } from '../../constants'
import { telemetry } from '../../telemetry/telemetry'
import { SamCliSettings } from './samCliSettings'

const localize = nls.loadMessageBundle()

const learnMore = localize('AWS.samcli.userChoice.visit.install.url', 'Install SAM CLI')
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
    const config = SamCliSettings.instance

    if (!args.passive) {
        // Force getOrDetectSamCli() to search for SAM CLI.
        await config.delete('location')
    }

    const sam = await config.getOrDetectSamCli(true)
    const notFound = sam.path === ''

    // Update the user setting.
    //
    // NOTE: We must NOT _passively_ auto-update the user setting, that
    // conflicts with VSCode "remote": each VSCode instance will update the
    // setting based on its local environment, but the user settings are
    // shared across VSCode instances...
    if (!args.passive && sam.autoDetected && sam.path) {
        await config.update('location', sam.path)
    }

    if (args.showMessage !== false || notFound) {
        if (notFound) {
            notifyUserSamCliNotDetected(config)
        } else if (args.showMessage === true) {
            void vscode.window.showInformationMessage(getSettingsUpdatedMessage(sam.path ?? '?'))
        }
    }

    if (!args.passive) {
        telemetry.sam_detect.emit({ result: sam.path ? 'Succeeded' : 'Failed' })
    }
}

function notifyUserSamCliNotDetected(SamCliSettings: SamCliSettings): void {
    // inform the user, but don't wait for this to complete
    void vscode.window
        .showErrorMessage(
            localize(
                'AWS.samcli.error.notFound',
                'Cannot find SAM CLI, which is required to create and debug SAM applications. If you have SAM CLI in a custom location, set the "aws.samcli.location" user setting.'
            ),
            learnMore,
            browseToSamCli
        )
        .then(async userResponse => {
            if (userResponse === learnMore) {
                await vscode.commands.executeCommand('vscode.open', samInstallUrl)
            } else if (userResponse === browseToSamCli) {
                const location: vscode.Uri[] | undefined = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    openLabel: 'Set location in user settings',
                })

                if (!!location && location.length === 1) {
                    const path: string = location[0].fsPath
                    await SamCliSettings.update('location', path)
                    void vscode.window.showInformationMessage(getSettingsUpdatedMessage(path))
                }
            }
        })
}

function getSettingsUpdatedMessage(location: string): string {
    const configuredLocation = localize('AWS.samcli.configured.location', 'SAM CLI Location: {0}', location)

    return `${settingsUpdated} ${configuredLocation}`
}
