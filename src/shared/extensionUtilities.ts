/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { readFileAsString } from './filesystemUtilities'
import { getLogger } from './logger'
import { VSCODE_EXTENSION_ID, extensionAlphaVersion } from './extensions'
import { BaseTemplates } from './templates/baseTemplates'
import { Ec2MetadataClient } from './clients/ec2MetadataClient'
import { DefaultEc2MetadataClient } from './clients/ec2MetadataClient'
import { extensionVersion, getCodeCatalystDevEnvId } from './vscode/env'
import { DevSettings } from './settings'

const localize = nls.loadMessageBundle()

const vscodeAppname = 'Visual Studio Code'
const cloud9Appname = 'AWS Cloud9'
const cloud9CnAppname = 'Amazon Cloud9'
const notInitialized = 'notInitialized'

export const mostRecentVersionKey: string = 'globalsMostRecentVersion'

export enum IDE {
    vscode,
    cloud9,
    unknown,
}

let computeRegion: string | undefined = notInitialized

export function getIdeType(): IDE {
    const settings = DevSettings.instance
    if (
        vscode.env.appName === cloud9Appname ||
        vscode.env.appName === cloud9CnAppname ||
        settings.get('forceCloud9', false)
    ) {
        return IDE.cloud9
    }

    // Theia doesn't necessarily have all env propertie
    // so we should be defensive and assume appName is nullable.
    if (vscode.env.appName?.startsWith(vscodeAppname)) {
        return IDE.vscode
    }

    return IDE.unknown
}

interface IdeProperties {
    shortName: string
    longName: string
    commandPalette: string
    codelens: string
    codelenses: string
    company: string
}

export function getIdeProperties(): IdeProperties {
    const company = localize('AWS.title', 'AWS')
    // in a separate const so other IDEs can take from this selectively.
    const vscodeVals: IdeProperties = {
        shortName: localize('AWS.vscode.shortName', 'VS Code'),
        longName: localize('AWS.vscode.longName', 'Visual Studio Code'),
        commandPalette: localize('AWS.vscode.commandPalette', 'Command Palette'),
        codelens: localize('AWS.vscode.codelens', 'CodeLens'),
        codelenses: localize('AWS.vscode.codelenses', 'CodeLenses'),
        company,
    }

    switch (getIdeType()) {
        case IDE.cloud9:
            if (isCn()) {
                return createCloud9Properties(localize('AWS.title.cn', 'Amazon'))
            }
            return createCloud9Properties(company)
        // default is IDE.vscode
        default:
            return vscodeVals
    }
}

function createCloud9Properties(company: string): IdeProperties {
    return {
        shortName: localize('AWS.cloud9.shortName', 'Cloud9'),
        longName: localize('AWS.cloud9.longName', '{0} Cloud9', company),
        commandPalette: localize('AWS.cloud9.commandPalette', 'Go to Anything Panel'),
        codelens: localize('AWS.cloud9.codelens', 'Inline Action'),
        codelenses: localize('AWS.cloud9.codelenses', 'Inline Actions'),
        company,
    }
}

/**
 * Decides if the current system is (the specified flavor of) Cloud9.
 */
export function isCloud9(flavor: 'classic' | 'codecatalyst' | 'any' = 'any'): boolean {
    const cloud9 = getIdeType() === IDE.cloud9
    if (!cloud9 || flavor === 'any') {
        return cloud9
    }
    const codecat = getCodeCatalystDevEnvId() !== undefined
    return (flavor === 'classic' && !codecat) || (flavor === 'codecatalyst' && codecat)
}

export function isCn(): boolean {
    return getComputeRegion()?.startsWith('cn') ?? false
}

/**
 * Applies function `getFn` to `obj` and returns the result, or fails silently.
 *
 * Example:
 *
 *     function blah(value?: SomeObject) {
 *       safeGet(value, x => x.propertyOfSomeObject)
 *     }
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
        vscode.window.showErrorMessage(localize('AWS.command.quickStart.error', 'Error while loading Quick Start page'))
    }
}

/**
 * Helper function to create a webview containing the quick start page
 * Returns an unfocused vscode.WebviewPanel if the quick start page is renderable.
 *
 * @param context VS Code Extension Context
 * @param page Page to load (use for testing)
 */
export async function createQuickStartWebview(
    context: vscode.ExtensionContext,
    page?: string
): Promise<vscode.WebviewPanel> {
    let actualPage: string
    if (page) {
        actualPage = page
    } else if (isCloud9()) {
        actualPage = `quickStartCloud9${isCn() ? '-cn' : ''}.html`
    } else {
        actualPage = 'quickStartVscode.html'
    }
    // create hidden webview, leave it up to the caller to show
    const view = vscode.window.createWebviewPanel(
        'html',
        localize('AWS.command.quickStart.title', '{0} Toolkit - Quick Start', getIdeProperties().company),
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
        { enableScripts: true }
    )

    const baseTemplateFn = _.template(BaseTemplates.simpleHtml)

    const htmlBody = convertExtensionRootTokensToPath(
        await readFileAsString(path.join(context.extensionPath, actualPage)),
        context.extensionPath,
        view.webview
    )

    view.webview.html = baseTemplateFn({
        cspSource: view.webview.cspSource,
        content: htmlBody,
    })

    return view
}

/**
 * Utility function to search for tokens in a string and convert them to relative paths parseable by VS Code
 * Useful for converting HTML images to webview-usable images
 *
 * @param text Text to scan
 * @param basePath Extension path (from extension context)
 */
function convertExtensionRootTokensToPath(text: string, basePath: string, webview: vscode.Webview): string {
    return text.replace(/!!EXTENSIONROOT!!(?<restOfUrl>[-a-zA-Z0-9@:%_\+.~#?&//=]*)/g, (matchedString, restOfUrl) => {
        return webview.asWebviewUri(vscode.Uri.file(`${basePath}${restOfUrl}`)).toString()
    })
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
export function isDifferentVersion(context: vscode.ExtensionContext, currVersion: string = extensionVersion): boolean {
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
    context.globalState.update(mostRecentVersionKey, extensionVersion)
}

/**
 * Shows a message with a link to the quickstart page.
 */
async function promptQuickstart(): Promise<void> {
    const view = localize('AWS.command.quickStart', 'View Quick Start')
    const prompt = await vscode.window.showInformationMessage(
        localize(
            'AWS.message.prompt.quickStart.toastMessage',
            'You are now using {0} Toolkit {1}',
            getIdeProperties().company,
            extensionVersion
        ),
        view
    )
    if (prompt === view) {
        vscode.commands.executeCommand('aws.quickStart')
    }
}

/**
 * Shows a "new version" or "alpha version" message.
 *
 * - If extension version is "alpha", shows a warning message.
 * - If extension version was not previously run on this machine, shows a toast
 *   with a link to the quickstart page.
 * - Otherwise does nothing.
 *
 * @param context VS Code Extension Context
 */
export function showWelcomeMessage(context: vscode.ExtensionContext): void {
    if (getCodeCatalystDevEnvId() !== undefined) {
        // Do not show clippy in CodeCatalyst development environments.
        return
    }
    const version = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)?.packageJSON.version
    if (version === extensionAlphaVersion) {
        vscode.window.showWarningMessage(
            localize(
                'AWS.startup.toastIfAlpha',
                '{0} Toolkit PREVIEW. (To get the latest STABLE version, uninstall this version.)',
                getIdeProperties().company
            )
        )
        return
    }
    try {
        if (isDifferentVersion(context)) {
            setMostRecentVersion(context)
            if (!isCloud9()) {
                promptQuickstart()
            }
        }
    } catch (err) {
        // swallow error and don't block extension load
        getLogger().error(err as Error)
    }
}

/**
 * Shows info about the extension and its environment.
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
    const node = process.versions.node ? `node: ${process.versions.node}\n` : 'node: ?\n'
    const electron = process.versions.electron ? `electron: ${process.versions.electron}\n` : ''

    const envDetails = localize(
        'AWS.message.toolkitInfo',
        'OS: {0} {1} {2}\n{3} extension host:  {4}\n{5} Toolkit:  {6}\n{7}{8}',
        osType,
        osArch,
        osRelease,
        getIdeProperties().longName,
        vsCodeVersion,
        getIdeProperties().company,
        extensionVersion,
        node,
        electron
    )

    return envDetails
}

/**
 * Returns the Cloud9 compute region or 'unknown' if we can't pull a region, or `undefined` if this is not Cloud9.
 */
export async function initializeComputeRegion(
    metadata: Ec2MetadataClient = new DefaultEc2MetadataClient(),
    isC9: boolean = isCloud9()
): Promise<void> {
    if (isC9) {
        try {
            const identity = await metadata.getInstanceIdentity()
            computeRegion = identity.region || 'unknown'
        } catch (e) {
            computeRegion = 'unknown'
        }
    } else {
        // not cloud9, region has no meaning
        computeRegion = undefined
    }
}

export function getComputeRegion(): string | undefined {
    if (computeRegion === notInitialized) {
        throw new Error('Attempted to get compute region without initializing.')
    }

    return computeRegion
}
