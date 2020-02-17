/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ScriptResource } from '../lambda/models/scriptResource'
import { ext } from '../shared/extensionGlobals'
import { mostRecentVersionKey, pluginVersion } from './constants'
import { readFileAsString } from './filesystemUtilities'
import { getLogger } from './logger'

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

    public static getCssForHtml(names: string[]): ScriptResource[] {
        const basePath = path.join(ext.context.extensionPath, 'media', 'css')

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
        _.forEach(names, scriptName => {
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
 * Helper function to show a webview containing the quick start page
 *
 * @param context VS Code Extension Context
 */
export async function showQuickStartWebview(context: vscode.ExtensionContext): Promise<void> {
    try {
        const view = await createQuickStartWebview(context)
        view.reveal()
    } catch {
        vscode.window.showErrorMessage(
            localize('AWS.command.quickStart.error', 'There was an error retrieving the Quick Start page')
        )
    }
}

/**
 * Helper function to create a webview containing the quick start page
 * Returns an unfocused vscode.WebviewPanel if the quick start page is renderable.
 *
 * @param context VS Code Extension Context
 * @param page Page to load (use for testing); default: `quickStart.html`
 */
export async function createQuickStartWebview(
    context: vscode.ExtensionContext,
    page: string = 'quickStart.html'
): Promise<vscode.WebviewPanel> {
    const html = convertExtensionRootTokensToPath(
        await readFileAsString(path.join(context.extensionPath, page)),
        context.extensionPath
    )
    // create hidden webview, leave it up to the caller to show
    const view = vscode.window.createWebviewPanel(
        'html',
        localize('AWS.command.quickStart.title', 'AWS Toolkit - Quick Start'),
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: true }
    )
    view.webview.html = html

    return view
}

/**
 * Utility function to search for tokens in a string and convert them to relative paths parseable by VS Code
 * Useful for converting HTML images to webview-usable images
 *
 * @param text Text to scan
 * @param basePath Extension path (from extension context)
 */
function convertExtensionRootTokensToPath(text: string, basePath: string): string {
    return text.replace(/!!EXTENSIONROOT!!/g, `vscode-resource:${basePath}`)
}

/**
 * Utility function to determine if the extension version has changed between activations
 * False (versions are identical) if version key exists in global state and matches the current version
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
    if (mostRecentVersion && mostRecentVersion === currVersion) {
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
async function promptQuickStart(): Promise<void> {
    const view = localize('AWS.command.quickStart', 'View Quick Start')
    const prompt = await vscode.window.showInformationMessage(
        localize(
            'AWS.message.prompt.quickStart.toastMessage',
            'You are now using the AWS Toolkit for Visual Studio Code, version {0}',
            pluginVersion
        ),
        view
    )
    if (prompt === view) {
        vscode.commands.executeCommand('aws.quickStart')
    }
}

/**
 * Checks if a user is new to this version
 * If so, pops a toast with a link to a quick start page
 *
 * @param context VS Code Extension Context
 */
export function toastNewUser(context: vscode.ExtensionContext): void {
    try {
        if (isDifferentVersion(context)) {
            setMostRecentVersion(context)
            // the welcome toast should be nonblocking.
            // tslint:disable-next-line: no-floating-promises
            promptQuickStart()
        }
    } catch (err) {
        // swallow error and don't block extension load
        getLogger().error(err as Error)
    }
}

/**
 * Creates a modal to display OS, AWS Toolkit, and VS Code
 * versions and allows user to copy to clipboard
 * Also prints to the toolkit output channel
 *
 * @param toolkitOutputChannel VS Code Output Channel
 */
export async function aboutToolkit(): Promise<void> {
    const toolkitEnvDetails = getToolkitEnvironmentDetails()
    const copyButtonLabel = localize('AWS.message.prompt.copyButtonLabel', 'Copy')
    const result = await vscode.window.showInformationMessage(toolkitEnvDetails, { modal: true }, copyButtonLabel)
    if (result === copyButtonLabel) {
        vscode.env.clipboard.writeText(toolkitEnvDetails)
    }
}

/**
 * Returns a string that includes the OS, AWS Toolkit,
 * and VS Code versions.
 */
export function getToolkitEnvironmentDetails(): string {
    const osType = os.type()
    const osArch = os.arch()
    const osRelease = os.release()
    const vsCodeVersion = vscode.version
    const envDetails = localize(
        'AWS.message.toolkitInfo',
        'OS:  {0} {1} {2}\nVisual Studio Code Version:  {3}\nAWS Toolkit for Visual Studio Code Version:  {4}\n',
        osType,
        osArch,
        osRelease,
        vsCodeVersion,
        pluginVersion
    )

    return envDetails
}
