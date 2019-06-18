/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'

import * as _ from 'lodash'
import * as path from 'path'
import * as semver from 'semver'
import * as vscode from 'vscode'
import { ScriptResource } from '../lambda/models/scriptResource'
import { ext } from '../shared/extensionGlobals'
import { mostRecentVersionKey, pluginVersion } from './constants'

const localize = nls.loadMessageBundle()

export class ExtensionUtilities {
    public static getLibrariesForHtml(names: string[]): ScriptResource[] {
        const basePath = path.join(ext.context.extensionPath, 'media', 'libs')

        return this.resolveResourceURIs(basePath, names)
    }

    public static getScriptsForHtml(names: string[]): ScriptResource[] {
        const basePath = path.join(ext.context.extensionPath, 'media', 'js')

        return this.resolveResourceURIs(basePath, names)
    }

    public static getNonce(): string {
        let text = ''
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length))
        }

        return text
    }

    private static resolveResourceURIs(basePath: string, names: string[]): ScriptResource[] {
        const scripts: ScriptResource[] = []
        _.forEach(names, (scriptName) => {
            const scriptPathOnDisk = vscode.Uri.file(path.join(basePath, scriptName))
            const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' })
            const nonce = ExtensionUtilities.getNonce()
            scripts.push({ nonce: nonce, uri: scriptUri })
        })

        return scripts
    }
}

/**
 * A utility function that takes a possibly null value and applies
 * the given function to it, returning the result of the function or null
 *
 * example usage:
 *
 * function blah(value?: SomeObject) {
 *  nullSafeGet(value, x => x.propertyOfSomeObject)
 * }
 *
 * @param obj the object to attempt the get function on
 * @param getFn the function to use to determine the mapping value
 */
export function safeGet<O, T>(obj: O | undefined, getFn: (x: O) => T): T | undefined {
    if (obj) {
        try {
            return getFn(obj)
        } catch (error) {
            // ignore
        }
    }

    return undefined
}

/**
 * Utility function to search for tokens in a string and convert them to relative paths parseable by VS Code
 * Useful for converting HTML images to webview-usable images
 *
 * @param basePath Extension path (from extension context)
 * @param text Text to scan
 * @param pattern Regex to search for (default: `/!!EXTENSIONROOT!!/g`)
 */
export function convertPathTokensToPath(
    basePath: string,
    text: string,
    pattern: RegExp = /!!EXTENSIONROOT!!/g
): string {
    return text.replace(pattern, `vscode-resource:${basePath}`)
}

/**
 * Utility function to determine if the extension version has changed between activations
 * False (versions are identical) if version key exists in global state, is a semver, and matches the current version
 * True (versions are different) if any of the above aren't true
 *
 * TODO: Change the threshold on which we display the welcome page?
 * For instance, if we start building nightlies, only show page for significant updates?
 *
 * @param context VS Code Extension Context
 * @param currVersion Current version to compare stored most recent version against (useful for tests)
 */
export function isDifferentVersion(context: vscode.ExtensionContext, currVersion: string = pluginVersion): boolean {
    const mostRecentVersion = context.globalState.get<string>(mostRecentVersionKey)
    if (mostRecentVersion && semver.valid(mostRecentVersion) && mostRecentVersion === currVersion) {
        return false
    }

    return true
}

/**
 * Utility function to update the most recently used extension version
 * Pulls from package.json
 *
 * @param context VS Code Extension Context
 */
export function setMostRecentVersion(context: vscode.ExtensionContext): void {
    context.globalState.update(mostRecentVersionKey, pluginVersion)
}

/**
 * Publishes a toast with a link to the welcome page
 */
export async function promptWelcome(): Promise<void> {
    const view = localize(
        'AWS.message.prompt.welcome.openPage',
        'View the Welcome Page'
    )
    const prompt = await vscode.window.showInformationMessage(
        localize(
            'AWS.message.prompt.welcome.toastMessage',
            'You are now using the AWS Toolkit for Visual Studio Code, version {0}',
            pluginVersion
        ),
        view,
        localize(
            'AWS.message.prompt.welcome.dismiss',
            'Dismiss'
        ),
    )
    if (prompt === view) {
        vscode.commands.executeCommand('aws.welcome')
    }
}
