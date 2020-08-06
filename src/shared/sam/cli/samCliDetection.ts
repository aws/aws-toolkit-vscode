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
const settingsNotUpdated = localize('AWS.samcli.detect.settings.not.updated', 'No settings changes necessary.')

/** Most-recent resolved SAM CLI location. */
let currentsamCliLocation: string | undefined = undefined

/**
 *
 * @param args.passive  If true, this was _not_ a user-initiated action.
 * @param args.showMessage true: always show message, false: never show
 * message, undefined: show message only if the new setting differs from
 * the old setting.
 */
export async function detectSamCli(args: { passive: boolean; showMessage: boolean | undefined }): Promise<void> {
    await lock.acquire('detect SAM CLI', async () => {
        const samCliConfig = new DefaultSamCliConfiguration(
            new DefaultSettingsConfiguration(extensionSettingsPrefix),
            new DefaultSamCliLocationProvider()
        )

        const valueBeforeInit = samCliConfig.getSamCliLocation()
        await samCliConfig.initialize()
        const valueAfterInit = samCliConfig.getSamCliLocation()
        const isAutoDetected = valueBeforeInit !== valueAfterInit
        const isUserSettingChanged = currentsamCliLocation !== valueAfterInit
        currentsamCliLocation = valueAfterInit

        if (args.showMessage !== false) {
            if (!valueAfterInit) {
                notifyUserSamCliNotDetected(samCliConfig)
            } else if (isUserSettingChanged || args.showMessage === true) {
                const message =
                    !isAutoDetected && !isUserSettingChanged
                        ? getSettingsNotUpdatedMessage(valueBeforeInit ?? '?')
                        : getSettingsUpdatedMessage(currentsamCliLocation ?? '?')

                vscode.window.showInformationMessage(message)
            }
        }

        if (!args.passive) {
            recordSamDetect({ result: currentsamCliLocation === undefined ? 'Failed' : 'Succeeded' })
        }
    })
}

function notifyUserSamCliNotDetected(samCliConfig: SamCliConfiguration): void {
    // inform the user, but don't wait for this to complete
    vscode.window
        .showErrorMessage(
            localize(
                'AWS.samcli.error.notFound',
                // tslint:disable-next-line:max-line-length
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

function getSettingsNotUpdatedMessage(location: string): string {
    const configuredLocation = localize('AWS.samcli.configured.location', 'SAM CLI Location: {0}', location)

    return `${settingsNotUpdated} ${configuredLocation}`
}
