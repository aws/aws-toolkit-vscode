/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import got from 'got'
import globals from '../shared/extensionGlobals'
import { getLogger } from '../shared/logger'
import * as admZip from 'adm-zip'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { makeTemporaryToolkitFolder } from '../shared/filesystemUtilities'
import { Settings } from '../shared/settings'

const localize = nls.loadMessageBundle()

const VSIX_LOCATION = 'https://***REMOVED***.cloudfront.net/aws-toolkit-vscode.vsix'
const VSIX_LOCAL_NAME = 'aws-toolkit-vscode-beta.vsix'
const VSIX_DOWNLOAD_INTERVAL_MS = 1000 * 60 * 60 * 24 // A day in milliseconds
const BETA_TOOLKIT_KEY = 'BETA_TOOLKIT'
const RELEASE_DATE = new Date('December 1, 2022 00:00:00 GMT+00:00')

interface BetaToolkit {
    needUpdate: boolean
    lastCheck: number
}

/**
 * Watch the beta VSIX daily for changes.
 * If this is the first time we are watching the beta version or if its been 24 hours since it was last checked then try to prompt for update
 */
export function watchBetaVSIX(): void {
    const toolkit = globals.context.globalState.get<BetaToolkit>(BETA_TOOLKIT_KEY)
    if (!toolkit || (toolkit && new Date().getTime() - toolkit.lastCheck > VSIX_DOWNLOAD_INTERVAL_MS)) {
        updateExtension()
    }

    globals.clock.setInterval(() => {
        updateExtension()
    }, VSIX_DOWNLOAD_INTERVAL_MS)
}

/**
 * Prompt to update the beta extension when required
 */
async function updateExtension(): Promise<void> {
    try {
        const resp = await got(VSIX_LOCATION).buffer()
        const tmpFolder = await makeTemporaryToolkitFolder()
        const betaPath = vscode.Uri.joinPath(vscode.Uri.file(tmpFolder), VSIX_LOCAL_NAME)
        await vscode.workspace.fs.writeFile(betaPath, resp)
        const latestBetaVersion = await getBetaVersion(betaPath)

        const currentVersion = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)?.packageJSON.version
        if (latestBetaVersion !== currentVersion) {
            await promptInstallToolkit(betaPath)
        } else {
            globals.context.globalState.update(BETA_TOOLKIT_KEY, {
                lastCheck: new Date().getTime(),
                needUpdate: false,
            } as BetaToolkit)
        }

        await vscode.workspace.fs.delete(vscode.Uri.file(tmpFolder), {
            recursive: true,
        })
    } catch (e) {
        getLogger().error((e as Error).message)
    }
}

/**
 * Assuming the latest beta VSIX exists at pluginPath, get the version or error if no beta toolkit version could be found
 *
 * @param pluginPath The path to the beta on disk
 * @returns The version of the beta
 * @throws Error if the beta toolkit version could not be found
 */
async function getBetaVersion(pluginPath: vscode.Uri): Promise<string> {
    const packageFile = new admZip(pluginPath.fsPath).getEntry('extension/package.json')
    const packageJSON = packageFile?.getData().toString()
    if (packageJSON) {
        return JSON.parse(packageJSON).version
    }
    throw new Error('Unable to verify beta toolkit version')
}

async function promptInstallToolkit(pluginPath: vscode.Uri): Promise<void> {
    const installBtn = localize('AWS.missingExtension.install', 'Install...')

    const response = await vscode.window.showInformationMessage(
        localize(
            'AWS.codecatalyst.beta.updatePrompt',
            'New version of AWS Toolkit is available at the CodeCatalyst beta link. You must install the new version in order to continue using CodeCatalyst.'
        ),
        installBtn
    )

    switch (response) {
        case installBtn:
            try {
                getLogger().info(`codecatalyst: Installing ${VSIX_LOCAL_NAME}`)
                await vscode.commands.executeCommand('workbench.extensions.installExtension', pluginPath)
                globals.context.globalState.update(BETA_TOOLKIT_KEY, {
                    lastCheck: new Date().getTime(),
                    needUpdate: false,
                } as BetaToolkit)
            } catch (e) {
                const err = e as Error
                getLogger().error(`codecatalyst: Extension ${VSIX_LOCAL_NAME} could not be installed: %s`, err.message)
            }
            break
        case undefined:
            globals.context.globalState.update(BETA_TOOLKIT_KEY, {
                lastCheck: new Date().getTime(),
                needUpdate: true,
            } as BetaToolkit)
            break
    }
}

export async function notifyCodeCatalystBetaUsers() {
    const toolkit = globals.context.globalState.get<BetaToolkit>(BETA_TOOLKIT_KEY)
    getLogger().verbose(
        `codecatalyst: checking for updated beta artifact. globalState.${BETA_TOOLKIT_KEY} = ${JSON.stringify(toolkit)}`
    )
    if (toolkit && toolkit.needUpdate) {
        await updateExtension()
    }

    const currentDate = new Date()
    if (currentDate.getTime() > RELEASE_DATE.getTime() && Settings.instance.get('update.mode') === 'none') {
        vscode.window.showInformationMessage(
            localize(
                'aws.codecatalyst.beta.launchPrompt',
                'CodeCatalyst was launched, please RE-ENABLE the vscode extension auto-update feature.'
            )
        )
    }
}
