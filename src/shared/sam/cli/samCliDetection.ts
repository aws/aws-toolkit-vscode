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

export async function detectSamCli(showMessageIfDetected: boolean): Promise<void> {
    await lock.acquire('detect SAM CLI', async () => {
        const samCliConfig = new DefaultSamCliConfiguration(
            new DefaultSettingsConfiguration(extensionSettingsPrefix),
            new DefaultSamCliLocationProvider()
        )

        const initialSamCliLocation = samCliConfig.getSamCliLocation()

        await samCliConfig.initialize()

        const currentsamCliLocation = samCliConfig.getSamCliLocation()

        if (showMessageIfDetected) {
            if (!currentsamCliLocation) {
                notifyUserSamCliNotDetected(samCliConfig)
            } else {
                const message: string =
                    initialSamCliLocation === currentsamCliLocation
                        ? getSettingsNotUpdatedMessage(initialSamCliLocation)
                        : getSettingsUpdatedMessage(currentsamCliLocation)

                vscode.window.showInformationMessage(message)
            }
        }

        recordSamDetect({ result: currentsamCliLocation === undefined ? 'Failed' : 'Succeeded' })
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
    const configuredLocation = localize('AWS.samcli.configured.location', 'Configured SAM CLI Location: {0}', location)

    return `${settingsUpdated} ${configuredLocation}`
}

function getSettingsNotUpdatedMessage(location: string): string {
    const configuredLocation = localize('AWS.samcli.configured.location', 'Configured SAM CLI Location: {0}', location)

    return `${settingsNotUpdated} ${configuredLocation}`
}
