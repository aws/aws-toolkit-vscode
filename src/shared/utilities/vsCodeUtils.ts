/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as pathutils from './pathUtils'
import { getLogger } from '../logger/logger'
import { Timeout, waitTimeout } from './timeoutUtils'

// TODO: Consider NLS initialization/configuration here & have packages to import localize from here
export const localize = nls.loadMessageBundle()

/**
 * Checks if the given extension is installed and active.
 */
export function isExtensionActive(extId: string): boolean {
    const extension = vscode.extensions.getExtension(extId)
    return !!extension && extension.isActive
}

/**
 * Activates the given extension and returns it, or does nothing
 * if the extension is not installed.
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
