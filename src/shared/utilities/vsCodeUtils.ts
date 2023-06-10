/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getIdeProperties } from '../extensionUtilities'
import * as pathutils from './pathUtils'
import { getLogger } from '../logger/logger'
import { CancellationError, Timeout, waitTimeout, waitUntil } from './timeoutUtils'
import { telemetry } from '../telemetry/telemetry'
import * as semver from 'semver'
import { isNonNullable } from './tsUtils'

// TODO: Consider NLS initialization/configuration here & have packages to import localize from here
export const localize = nls.loadMessageBundle()

/**
 * Executes the close all editors command and waits for all visible editors to disappear
 */
export async function closeAllEditors() {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')

    // The output channel counts as an editor, but you can't really close that...
    const noVisibleEditor: boolean | undefined = await waitUntil(
        async () => {
            const visibleEditors = vscode.window.visibleTextEditors.filter(
                editor => !editor.document.fileName.includes('extension-output') // Output channels are named with the prefix 'extension-output'
            )

            return visibleEditors.length === 0
        },
        {
            timeout: 2500, // Arbitrary values. Should succeed except when VS Code is lagging heavily.
            interval: 250,
            truthy: true,
        }
    )

    if (!noVisibleEditor) {
        throw new Error(
            `Editor "${
                vscode.window.activeTextEditor!.document.fileName
            }" was still open after executing "closeAllEditors"`
        )
    }
}

/**
 * Checks if an extension is installed and active.
 */
export function isExtensionActive(extId: string): boolean {
    const extension = vscode.extensions.getExtension(extId)
    return !!extension && extension.isActive
}

/**
 * Checks if an extension is installed and meets the version requirement
 * @param minVersion The minimum semver required for the extension
 */
export function isExtensionInstalled(
    extId: string,
    minVersion?: string,
    getExtension = vscode.extensions.getExtension
): boolean {
    const ext = getExtension(extId)
    if (ext === undefined) {
        return false
    }

    if (minVersion === undefined) {
        return true
    }

    // check ext has valid version
    const extSemver = semver.coerce(ext.packageJSON.version)
    const minSemver = semver.coerce(minVersion)
    if (!isNonNullable(extSemver) || !isNonNullable(minSemver)) {
        return false
    }
    return semver.gte(extSemver, minSemver)
}

export async function showExtensionPage(extId: string) {
    try {
        // Available commands:
        //  - extension.open: opens extension page in VS Code extension marketplace view
        //  - workbench.extensions.installExtension: autoinstalls plugin with no additional feedback
        //  - workspace.extension.search: preloads and executes a search in the extension sidebar with the given term
        await vscode.commands.executeCommand('extension.open', extId)
    } catch (e) {
        const err = e as Error
        getLogger().error('extension.open command failed: %s', err.message)
        const uri = vscode.Uri.parse(`https://marketplace.visualstudio.com/items?itemName=${extId}`)
        openUrl(uri)
    }
}

/**
 * Checks if an extension is installed, and shows a message if not.
 */
export function showInstallExtensionMsg(
    extId: string,
    extName: string,
    feat = `${getIdeProperties().company} Toolkit`,
    minVersion?: string
): boolean {
    if (isExtensionInstalled(extId, minVersion)) {
        return true
    }

    const msg = buildMissingExtensionMessage(extId, extName, minVersion, feat)

    const installBtn = localize('AWS.missingExtension.install', 'Install...')
    const items = [installBtn]

    const p = vscode.window.showErrorMessage(msg, ...items)
    p.then<string | undefined>(selection => {
        if (selection === installBtn) {
            showExtensionPage(extId)
        }
        return selection
    })
    return false
}

export function buildMissingExtensionMessage(
    extId: string,
    extName: string,
    minVersion?: string,
    feat = `${getIdeProperties().company} Toolkit`
): string {
    const minV = semver.coerce(minVersion)
    const expectedVersionMsg = isNonNullable(minV) ? ` of version >=${minV}` : ''

    return localize(
        'AWS.missingExtension',
        "{0} requires the {1} extension ('{2}'{3}) to be installed and enabled.",
        feat,
        extName,
        extId,
        expectedVersionMsg
    )
}

/**
 * Activates an extension and returns it, or does nothing if the extension is
 * not installed.
 *
 * @param extId Extension id
 * @param silent Return undefined on failure, instead of throwing
 * @returns Extension, or undefined on failure if `silent`
 */
export async function activateExtension<T>(
    extId: string,
    silent: boolean = true,
    log = (s: string, ...rest: any[]) => {
        getLogger().debug(s, ...rest)
    }
): Promise<vscode.Extension<T> | undefined> {
    const extension = vscode.extensions.getExtension<T>(extId)
    if (!extension) {
        if (silent) {
            return undefined
        }
        throw new Error(`Extension not found: ${extId}`)
    }

    if (!extension.isActive) {
        log('Activating extension: %s', extId)
        try {
            const activate = (async () => {
                await extension.activate()
                log('Extension activated: %s', extId)
                return vscode.extensions.getExtension<T>(extId)
            })()

            return await waitTimeout(activate, new Timeout(60000))
        } catch (err) {
            log('Extension failed to activate: %s: %O', extId, err as Error)
            if (!silent) {
                throw err
            }
            return undefined
        }
    }

    return extension
}

/**
 * Convenience function to make a Thenable into a Promise.
 */
export function promisifyThenable<T>(thenable: Thenable<T>): Promise<T> {
    return new Promise((resolve, reject) => thenable.then(resolve, reject))
}

export function isUntitledScheme(uri: vscode.Uri): boolean {
    return uri.scheme === 'untitled'
}

// If the VSCode URI is not a file then return the string representation, otherwise normalize the filesystem path
export function normalizeVSCodeUri(uri: vscode.Uri): string {
    if (uri.scheme !== 'file') {
        return uri.toString()
    }
    return pathutils.normalize(uri.fsPath)
}

export function reloadWindowPrompt(message: string): void {
    const reload = 'Reload'

    vscode.window.showInformationMessage(message, reload).then(selected => {
        if (selected === reload) {
            vscode.commands.executeCommand('workbench.action.reloadWindow')
        }
    })
}

/**
 * Opens a URL in the system web browser. Throws `CancellationError`
 * if user dismisses the vscode confirmation prompt.
 */
export async function openUrl(url: vscode.Uri): Promise<boolean> {
    return telemetry.aws_openUrl.run(async span => {
        span.record({ url: url.toString() })
        const didOpen = await vscode.env.openExternal(url)
        if (!didOpen) {
            throw new CancellationError('user')
            // getLogger().verbose('failed to open URL: %s', e)
        }
        return didOpen
    })
}
