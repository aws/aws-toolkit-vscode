/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import AdmZip from 'adm-zip'
import got from 'got'
import globals from '../shared/extensionGlobals'
import { getLogger } from '../shared/logger/logger'
import fs from '../shared/fs/fs'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { makeTemporaryToolkitFolder } from '../shared/filesystemUtilities'
import { reloadWindowPrompt } from '../shared/utilities/vsCodeUtils'
import { isUserCancelledError, ToolkitError } from '../shared/errors'
import { telemetry } from '../shared/telemetry/telemetry'
import { cast } from '../shared/utilities/typeConstructors'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { isAmazonQ, productName } from '../shared/extensionUtilities'
import * as devConfig from './config'
import { isReleaseVersion } from '../shared/vscode/env'
import { getRelativeDate } from '../shared/datetime'

const localize = nls.loadMessageBundle()
const logger = getLogger('dev/beta')

const downloadIntervalMs = 1000 * 60 * 60 * 3 // 3 hours (8 times/day).

interface BetaToolkit {
    readonly needUpdate: boolean
    readonly lastCheck: number
}

function getBetaToolkitData(vsixUrl: string): BetaToolkit | undefined {
    return globals.globalState.tryGet<Record<string, BetaToolkit>>('dev.beta', Object, {})[vsixUrl]
}

async function updateBetaToolkitData(vsixUrl: string, data: BetaToolkit) {
    await globals.globalState.update('dev.beta', {
        ...globals.globalState.get<Record<string, BetaToolkit>>('dev.beta', {}),
        [vsixUrl]: data,
    })
}

/**
 * Set up "beta" update monitoring.
 */
export async function activate(ctx: vscode.ExtensionContext) {
    const betaUrl = isAmazonQ() ? devConfig.betaUrl.amazonq : devConfig.betaUrl.toolkit
    if (!isReleaseVersion() && betaUrl) {
        ctx.subscriptions.push(watchBetaVSIX(betaUrl))
    }
}

/**
 * Watch the beta VSIX daily for changes.
 * If this is the first time we are watching the beta version or if its been 24 hours since it was last checked then try to prompt for update
 */
export function watchBetaVSIX(vsixUrl: string): vscode.Disposable {
    const toolkit = getBetaToolkitData(vsixUrl)
    const lastCheckRel = toolkit ? getRelativeDate(new Date(toolkit.lastCheck)) : ''
    logger.info('watching beta artifacts url (lastCheck: %s): %s', lastCheckRel, vsixUrl)

    if (!toolkit || toolkit.needUpdate || Date.now() - toolkit.lastCheck > downloadIntervalMs) {
        runAutoUpdate(vsixUrl).catch((e) => {
            logger.error('runAutoUpdate failed: %s', (e as Error).message)
        })
    }

    const interval = globals.clock.setInterval(() => runAutoUpdate(vsixUrl), downloadIntervalMs)
    return { dispose: () => clearInterval(interval) }
}

async function runAutoUpdate(vsixUrl: string) {
    logger.debug(`checking url for a new version: %s`, vsixUrl)

    try {
        await telemetry.aws_autoUpdateBeta.run(() => checkBetaUrl(vsixUrl))
    } catch (e) {
        if (!isUserCancelledError(e)) {
            logger.warn('beta extension auto-update failed: %s', e)
        }
    }
}

/**
 * Prompt to update the beta extension when required
 */
async function checkBetaUrl(vsixUrl: string): Promise<void> {
    const resp = await got(vsixUrl).buffer()
    const latestBetaInfo = await getExtensionInfo(resp)
    const extId = isAmazonQ() ? VSCODE_EXTENSION_ID.amazonq : VSCODE_EXTENSION_ID.awstoolkit
    if (extId !== `${latestBetaInfo.publisher}.${latestBetaInfo.name}`) {
        throw new ToolkitError('URL does not point to an AWS Toolkit artifact', { code: 'InvalidExtensionName' })
    }

    const currentVersion = vscode.extensions.getExtension(extId)?.packageJSON.version
    if (latestBetaInfo.version !== currentVersion) {
        const tmpFolder = await makeTemporaryToolkitFolder()
        const betaPath = vscode.Uri.joinPath(vscode.Uri.file(tmpFolder), path.basename(vsixUrl))
        await fs.writeFile(betaPath, resp)

        try {
            await promptInstallToolkit(betaPath, latestBetaInfo.version, vsixUrl)
        } finally {
            await fs.delete(tmpFolder, { recursive: true })
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
    readonly publisher: string
}

/**
 * Get information about the extension or error if no version could be found
 *
 * @param extension The URI of the extension on disk or the raw data
 * @returns The version + name of the extension
 * @throws Error if the extension manifest could not be found or parsed
 */
async function getExtensionInfo(extension: Buffer): Promise<ExtensionInfo>
async function getExtensionInfo(extensionLocation: vscode.Uri): Promise<ExtensionInfo>
async function getExtensionInfo(extensionOrLocation: vscode.Uri | Buffer): Promise<ExtensionInfo> {
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
            publisher: cast(data.publisher, String),
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
            'New version of {0} is available at the [beta URL]({1}). Install the new version "{2}" to continue using the beta.',
            productName(),
            vsixUrl,
            newVersion
        ),
        installBtn
    )

    switch (response) {
        case installBtn:
            try {
                logger.info(`installing artifact: ${vsixName}`)
                await vscode.commands.executeCommand('workbench.extensions.installExtension', pluginPath)
                await updateBetaToolkitData(vsixUrl, {
                    lastCheck: Date.now(),
                    needUpdate: false,
                })
                reloadWindowPrompt(
                    localize('AWS.dev.beta.reloadPrompt', 'Reload now to use the new beta {0}.', productName())
                )
            } catch (e) {
                throw ToolkitError.chain(e, `Failed to install ${vsixName}`, { code: 'FailedExtensionInstall' })
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
