/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MetadataService } from 'aws-sdk'
import * as _ from 'lodash'
import * as os from 'os'
import * as path from 'path'
import * as semver from 'semver'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { ext } from '../shared/extensionGlobals'
import { readFileAsString } from './filesystemUtilities'
import { getLogger } from './logger'
import { VSCODE_EXTENSION_ID, EXTENSION_ALPHA_VERSION } from './extensions'
import { DefaultSettingsConfiguration } from './settingsConfiguration'
import { BaseTemplates } from './templates/baseTemplates'

const localize = nls.loadMessageBundle()

const VSCODE_APPNAME = 'Visual Studio Code'
const CLOUD9_APPNAME = 'AWS Cloud9'
const CLOUD9_CN_APPNAME = 'Amazon Cloud9'
const TEST_VERSION = 'testPluginVersion'
const NOT_INITIALIZED = 'notInitialized'

export const mostRecentVersionKey: string = 'awsToolkitMostRecentVersion'
// This is a hack to get around webpack messing everything up in unit test mode, it's also a very obvious
// bad version if something goes wrong while building it
let pluginVersion = TEST_VERSION
try {
    pluginVersion = PLUGINVERSION
} catch (e) {}

export { pluginVersion }

export enum IDE {
    vscode,
    cloud9,
    unknown,
}

let computeRegion: string | undefined = NOT_INITIALIZED

export function getIdeType(): IDE {
    const settings = new DefaultSettingsConfiguration('aws')
    if (vscode.env.appName === CLOUD9_APPNAME || vscode.env.appName === CLOUD9_CN_APPNAME || !!settings.readSetting<boolean>('forceCloud9', false)) {
        return IDE.cloud9
    }

    // Theia doesn't necessarily have all env propertie
    // so we should be defensive and assume appName is nullable.
    if (vscode.env.appName?.startsWith(VSCODE_APPNAME)) {
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
        company
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
        company
    }
}

/**
 * Returns whether or not this is Cloud9
 */
export function isCloud9(): boolean {
    return getIdeType() === IDE.cloud9
}

export function isCn(): boolean {
    return getComputeRegion()?.startsWith('cn') ?? false
}

export class ExtensionUtilities {
    public static getLibrariesForHtml(names: string[], webview: vscode.Webview): vscode.Uri[] {
        const basePath = path.join(ext.context.extensionPath, 'media', 'libs')

        return this.resolveResourceURIs(basePath, names, webview)
    }

    public static getScriptsForHtml(names: string[], webview: vscode.Webview): vscode.Uri[] {
        const basePath = path.join(ext.context.extensionPath, 'media', 'js')

        return this.resolveResourceURIs(basePath, names, webview)
    }

    public static getCssForHtml(names: string[], webview: vscode.Webview): vscode.Uri[] {
        const basePath = path.join(ext.context.extensionPath, 'media', 'css')

        return this.resolveResourceURIs(basePath, names, webview)
    }

    private static resolveResourceURIs(basePath: string, names: string[], webview: vscode.Webview): vscode.Uri[] {
        const scripts: vscode.Uri[] = []
        _.forEach(names, scriptName => {
            const scriptPathOnDisk = vscode.Uri.file(path.join(basePath, scriptName))
            scripts.push(webview.asWebviewUri(scriptPathOnDisk))
        })

        return scripts
    }

    public static getFilesAsVsCodeResources(rootdir: string, filenames: string[], webview: vscode.Webview) {
        const arr: vscode.Uri[] = []
        for (const filename of filenames) {
            arr.push(webview.asWebviewUri(vscode.Uri.file(path.join(rootdir, filename))))
        }

        return arr
    }
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
        actualPage = `quickStartCloud9${ isCn() ? '-cn' : '' }.html`
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

    const baseTemplateFn = _.template(BaseTemplates.SIMPLE_HTML)

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
 * Returns true if the current build is a production build (as opposed to a
 * prerelease/test/nightly build)
 */
export function isReleaseVersion(): boolean {
    return !semver.prerelease(pluginVersion) && pluginVersion !== TEST_VERSION
}

/**
 * Shows a message with a link to the quickstart page.
 * In cloud9, directly opens quickstart instead
 */
async function showOrPromptQuickstart(): Promise<void> {
    if (isCloud9()) {
        vscode.commands.executeCommand('aws.quickStart')
    } else {
        const view = localize('AWS.command.quickStart', 'View Quick Start')
        const prompt = await vscode.window.showInformationMessage(
            localize(
                'AWS.message.prompt.quickStart.toastMessage',
                'You are now using {0} Toolkit version {1}',
                getIdeProperties().company,
                pluginVersion
            ),
            view
        )
        if (prompt === view) {
            vscode.commands.executeCommand('aws.quickStart')
        }
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
    const version = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)?.packageJSON.version
    if (version === EXTENSION_ALPHA_VERSION) {
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
            // the welcome toast should be nonblocking.
            showOrPromptQuickstart()
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
        'OS:  {0} {1} {2}\n{3} Extension Host Version:  {4}\{5} Toolkit Version:  {6}\n',
        osType,
        osArch,
        osRelease,
        getIdeProperties().longName,
        vsCodeVersion,
        getIdeProperties().company,
        pluginVersion
    )

    return envDetails
}

/**
 * Returns the Cloud9 compute region or 'unknown' if we can't pull a region, or `undefined` if this is not Cloud9.
 */
 export async function initializeComputeRegion(
    metadataService: MetadataService = new MetadataService(),
    isC9: boolean = isCloud9()
): Promise<void> {
    if (isC9) {
        try {
            const identity: { [key: string]: string; region: string } = await new Promise((resolve, reject) => {
                // MetadataService.request() doesn't support .promise()...
                metadataService.request('/latest/dynamic/instance-identity/document', (err, data) => {
                    if (err) {
                        reject(err)
                    }
                    resolve(JSON.parse(data))
                })
            })

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
    if (computeRegion === NOT_INITIALIZED) {
        throw new Error('Attempted to get compute region without initializing.')
    }

    return computeRegion
}
