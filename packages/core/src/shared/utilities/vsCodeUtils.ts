/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getIdeProperties } from '../extensionUtilities'
import * as pathutils from './pathUtils'
import { getLogger } from '../logger/logger'
import { CancellationError, Timeout, waitTimeout } from './timeoutUtils'
import { telemetry } from '../telemetry/telemetry'
import * as semver from 'semver'
import { isNonNullable } from './tsUtils'
import { VSCODE_EXTENSION_ID } from '../extensions'

// TODO: Consider NLS initialization/configuration here & have packages to import localize from here
export const localize = nls.loadMessageBundle()

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
        void openUrl(uri)
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
    void p.then<string | undefined>((selection) => {
        if (selection === installBtn) {
            void showExtensionPage(extId)
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
    const expectedVersionMsg = isNonNullable(minV) ? ` of version >=${minV.version}` : ''

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

/**
 * Creates a glob pattern that matches all directories specified in `dirs`.
 *
 * "/" and "*" chars are trimmed from `dirs` items, and the final glob is defined such that the
 * directories and their contents are matched any _any_ depth.
 *
 * Example: `['foo', '**\/bar/'] => "["foo", "bar"]"`
 */
export function globDirPatterns(dirs: string[]): string[] {
    // The patterns themselves are not useful, but with postformating like "**/${pattern}/" they become glob dir patterns
    return dirs.map((current) => {
        // Trim all "*" and "/" chars.
        // Note that the replace() patterns and order is intentionaly so that "**/*foo*/**" yields "*foo*".
        const scrubbed = current
            .replace(/^\**/, '')
            .replace(/^[/\\]*/, '')
            .replace(/\**$/, '')
            .replace(/[/\\]*$/, '')
        return scrubbed
    })
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

    void vscode.window.showInformationMessage(message, reload).then((selected) => {
        if (selected === reload) {
            void vscode.commands.executeCommand('workbench.action.reloadWindow')
        }
    })
}

/**
 * Opens a URL in the system web browser. Throws `CancellationError`
 * if user dismisses the vscode confirmation prompt.
 */
export async function openUrl(url: vscode.Uri, source?: string): Promise<boolean> {
    return telemetry.aws_openUrl.run(async (span) => {
        span.record({ url: url.toString(), source })
        const didOpen = await vscode.env.openExternal(url)
        if (!didOpen) {
            throw new CancellationError('user')
            // getLogger().verbose('failed to open URL: %s', e)
        }
        return didOpen
    })
}

export function isToolkitActive(): boolean {
    return isExtensionActive(VSCODE_EXTENSION_ID.awstoolkit)
}

/**
 * Replaces magic vscode variables in a (launch config) user value.
 */
export function replaceVscodeVars(val: string, workspaceFolder?: string): string {
    if (!workspaceFolder) {
        return val
    }
    return val.replace('${workspaceFolder}', workspaceFolder)
}

/**
 *
 * Subscribe an given event and will dispose it once subscribe receives one event
 */
export function subscribeOnce<T>(event: vscode.Event<T>): vscode.Event<T> {
    return (listener: (e: T) => unknown, thisArgs?: unknown) => {
        const result = event((e) => {
            result.dispose()
            return listener.call(thisArgs, e)
        })

        return result
    }
}
