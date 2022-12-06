/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import * as AdmZip from 'adm-zip'
import got from 'got'
import globals from '../shared/extensionGlobals'
import { getLogger } from '../shared/logger'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { makeTemporaryToolkitFolder } from '../shared/filesystemUtilities'
import { reloadWindowPrompt } from '../shared/utilities/vsCodeUtils'
import { ToolkitError } from '../shared/errors'
import { SystemUtilities } from '../shared/systemUtilities'
import { telemetry } from '../shared/telemetry/telemetry'
import { cast } from '../shared/utilities/typeConstructors'
import { CancellationError } from '../shared/utilities/timeoutUtils'

const localize = nls.loadMessageBundle()

const downloadIntervalMs = 1000 * 60 * 60 * 24 // A day in milliseconds
const betaToolkitKey = 'dev.beta'

interface BetaToolkit {
    readonly needUpdate: boolean
    readonly lastCheck: number
}

function getBetaToolkitData(vsixUrl: string): BetaToolkit | undefined {
    return globals.context.globalState.get<Record<string, BetaToolkit>>(betaToolkitKey, {})[vsixUrl]
}

async function updateBetaToolkitData(vsixUrl: string, data: BetaToolkit) {
    await globals.context.globalState.update(betaToolkitKey, {
        ...globals.context.globalState.get<Record<string, BetaToolkit>>(betaToolkitKey, {}),
        [vsixUrl]: data,
    })
}

/**
 * Watch the beta VSIX daily for changes.
 * If this is the first time we are watching the beta version or if its been 24 hours since it was last checked then try to prompt for update
 */
export function watchBetaVSIX(vsixUrl: string): vscode.Disposable {
    const toolkit = getBetaToolkitData(vsixUrl)
    if (!toolkit || toolkit.needUpdate || Date.now() - toolkit.lastCheck > downloadIntervalMs) {
        runCheck(vsixUrl)
    }

    const interval = globals.clock.setInterval(() => runCheck(vsixUrl), downloadIntervalMs)
    return { dispose: () => clearInterval(interval) }
}

const runCheck = telemetry.instrument('vscode_checkBeta', checkBetaUrl)

/**
 * Prompt to update the beta extension when required
 */
async function checkBetaUrl(vsixUrl: string): Promise<void> {
    const resp = await got(vsixUrl).buffer()
    const latestBetaInfo = await getExtensionVersion(resp)
    if (!VSCODE_EXTENSION_ID.awstoolkit.endsWith(latestBetaInfo.name)) {
        throw new ToolkitError('URL does not point to an AWS Toolkit artifact', { code: 'InvalidExtensionName' })
    }

    const currentVersion = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)?.packageJSON.version
    if (latestBetaInfo.version !== currentVersion) {
        const tmpFolder = await makeTemporaryToolkitFolder()
        const betaPath = vscode.Uri.joinPath(vscode.Uri.file(tmpFolder), path.basename(vsixUrl))
        await SystemUtilities.writeFile(betaPath, resp)

        try {
            await promptInstallToolkit(betaPath, latestBetaInfo.version, vsixUrl)
        } finally {
            await SystemUtilities.remove(tmpFolder)
        }
    } else {
        await updateBetaToolkitData(vsixUrl, {
            lastCheck: Date.now(),
            needUpdate: false,
        })
    }
}

interface ExtensionInfo {
    readonly name: string
    readonly version: string
}

/**
 * Get the version of the extension or error if no version could be found
 *
 * @param extension The URI of the extension on disk or the raw data
 * @returns The version of the extension
 * @throws Error if the version could not be found
 */
async function getExtensionVersion(extension: Buffer): Promise<ExtensionInfo>
async function getExtensionVersion(extensionLocation: vscode.Uri): Promise<ExtensionInfo>
async function getExtensionVersion(extensionOrLocation: vscode.Uri | Buffer): Promise<ExtensionInfo> {
    const fileNameOrData = extensionOrLocation instanceof vscode.Uri ? extensionOrLocation.fsPath : extensionOrLocation
    const packageFile = new AdmZip(fileNameOrData).getEntry('extension/package.json')
    const packageJSON = packageFile?.getData().toString()
    if (!packageJSON) {
        throw new ToolkitError('Extension does not have a `package.json`', { code: 'NoPackageJson' })
    }

    try {
        const data = JSON.parse(packageJSON)

        return {
            name: cast(data.name, String),
            version: cast(data.version, String),
        }
    } catch (e) {
        throw ToolkitError.chain(e, 'Unable to parse extension data', { code: 'BadParse' })
    }
}

async function promptInstallToolkit(pluginPath: vscode.Uri, newVersion: string, vsixUrl: string): Promise<void> {
    const vsixName = path.basename(pluginPath.fsPath)
    const installBtn = localize('AWS.missingExtension.install', 'Install...')

    const response = await vscode.window.showInformationMessage(
        localize(
            'AWS.dev.beta.updatePrompt',
            `New version of AWS Toolkit is available at the beta URL (${vsixUrl}). Install the new version "{0}" to continue using the beta.`,
            newVersion
        ),
        installBtn
    )

    switch (response) {
        case installBtn:
            try {
                getLogger().info(`dev: installing artifact ${vsixName}`)
                await vscode.commands.executeCommand('workbench.extensions.installExtension', pluginPath)
                await updateBetaToolkitData(vsixUrl, {
                    lastCheck: Date.now(),
                    needUpdate: false,
                })
                reloadWindowPrompt(localize('AWS.dev.beta.reloadPrompt', 'Reload now to use the new beta AWS Toolkit.'))
            } catch (e) {
                getLogger().error(`dev: extension ${vsixName} could not be installed: %s`, e)
            }
            break
        case undefined:
            await updateBetaToolkitData(vsixUrl, {
                lastCheck: Date.now(),
                needUpdate: true,
            })
            throw new CancellationError('user')
    }
}
