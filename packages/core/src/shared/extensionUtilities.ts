/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as os from 'os'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getLogger } from './logger'
import { VSCODE_EXTENSION_ID, extensionAlphaVersion } from './extensions'
import { Ec2MetadataClient } from './clients/ec2MetadataClient'
import { DefaultEc2MetadataClient } from './clients/ec2MetadataClient'
import { extensionVersion, getCodeCatalystDevEnvId } from './vscode/env'
import { DevSettings } from './settings'
import globals from './extensionGlobals'
import { once } from './utilities/functionUtils'

const localize = nls.loadMessageBundle()

const vscodeAppname = 'Visual Studio Code'
const cloud9Appname = 'AWS Cloud9'
const cloud9CnAppname = 'Amazon Cloud9'
const sageMakerAppname = 'SageMaker Code Editor'
const notInitialized = 'notInitialized'

function _isAmazonQ() {
    const id = globals.context.extension.id
    const isToolkit = id === VSCODE_EXTENSION_ID.awstoolkit || id === VSCODE_EXTENSION_ID.awstoolkitcore
    const isQ = id === VSCODE_EXTENSION_ID.amazonq
    if (!isToolkit && !isQ) {
        throw Error(`unexpected extension id: ${id}`) // sanity check
    }
    return isQ
}

/** True if the current extension is "Amazon Q", else the current extension is "AWS Toolkit". */
export const isAmazonQ = once(_isAmazonQ)

export function productName() {
    return isAmazonQ() ? 'Amazon Q' : `${getIdeProperties().company} Toolkit`
}

export const mostRecentVersionKey: string = 'globalsMostRecentVersion'

export enum IDE {
    vscode,
    cloud9,
    sagemaker,
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

    if (vscode.env.appName === sageMakerAppname) {
        return IDE.sagemaker
    }

    // Theia doesn't necessarily have all env properties
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
        case IDE.sagemaker:
            if (isCn()) {
                // check for cn region
                return createSageMakerProperties(localize('AWS.title.cn', 'Amazon'))
            }
            return createSageMakerProperties(company)
        // default is IDE.vscode
        default:
            return vscodeVals
    }
}

function createSageMakerProperties(company: string): IdeProperties {
    return {
        shortName: localize('AWS.vscode.shortName', '{0} Code Editor', company),
        longName: localize('AWS.vscode.longName', '{0} SageMaker Code Editor', company),
        commandPalette: localize('AWS.vscode.commandPalette', 'Command Palette'),
        codelens: localize('AWS.vscode.codelens', 'CodeLens'),
        codelenses: localize('AWS.vscode.codelenses', 'CodeLenses'),
        company,
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

export function isSageMaker(): boolean {
    return vscode.env.appName === sageMakerAppname
}

export function isCn(): boolean {
    return getComputeRegion()?.startsWith('cn') ?? false
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
    context.globalState.update(mostRecentVersionKey, extensionVersion).then(undefined, e => {
        getLogger().error('globalState.update() failed: %s', (e as Error).message)
    })
}

/**
 * Shows a message with a link to the quickstart page.
 */
async function promptQuickstart(): Promise<void> {
    return // We want to skip this to reduce clutter, but will look back at improving this
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
        await vscode.commands.executeCommand('aws.quickStart')
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
        // Do not show clippy in CodeCatalyst dev environments.
        return
    }
    const version = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)?.packageJSON.version
    if (version === extensionAlphaVersion) {
        void vscode.window.showWarningMessage(
            localize(
                'AWS.startup.toastIfAlpha',
                '{0} PREVIEW. (To get the latest STABLE version, uninstall this version.)',
                productName()
            )
        )
        return
    }
    try {
        if (isDifferentVersion(context)) {
            setMostRecentVersion(context)
            if (!isCloud9()) {
                void promptQuickstart()
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
export async function aboutExtension(): Promise<void> {
    const extEnvDetails = getExtEnvironmentDetails()
    const copyButtonLabel = localize('AWS.message.prompt.copyButtonLabel', 'Copy')
    const result = await vscode.window.showInformationMessage(extEnvDetails, { modal: true }, copyButtonLabel)
    if (result === copyButtonLabel) {
        void vscode.env.clipboard.writeText(extEnvDetails)
    }
}

/**
 * Returns a string that includes the OS, extension, and VS Code versions.
 */
export function getExtEnvironmentDetails(): string {
    const osType = os.type()
    const osArch = os.arch()
    const osRelease = os.release()
    const vsCodeVersion = vscode.version
    const node = process.versions.node ? `node: ${process.versions.node}\n` : 'node: ?\n'
    const electron = process.versions.electron ? `electron: ${process.versions.electron}\n` : ''

    const envDetails = localize(
        'AWS.message.toolkitInfo',
        'OS: {0} {1} {2}\n{3} extension host:  {4}\n{5}:  {6}\n{7}{8}',
        osType,
        osArch,
        osRelease,
        getIdeProperties().longName,
        vsCodeVersion,
        productName(),
        extensionVersion,
        node,
        electron
    )

    return envDetails
}

/**
 * Returns the Cloud9/SageMaker compute region or 'unknown' if we can't pull a region, or `undefined` if this is not Cloud9 or SageMaker.
 */

export async function initializeComputeRegion(
    metadata?: Ec2MetadataClient,
    isC9?: boolean,
    isSM?: boolean
): Promise<void> {
    isC9 ??= isCloud9()
    isSM ??= isSageMaker()
    if (isC9 || isSM) {
        metadata ??= new DefaultEc2MetadataClient()
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

/**
 * Provides an {@link vscode.Event} that is triggered when the user interacts with the extension.
 * This will help to be notified of user activity.
 */
export class ExtensionUserActivity implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private activityEvent = new vscode.EventEmitter<void>()
    /** The event that is triggered when the user interacts with the extension */
    onUserActivity = this.activityEvent.event

    /**
     * @param delay The delay until a throttled user activity event is fired in milliseconds.
     * @param customEvents For testing purposes. The events that trigger the user activity.
     * @returns
     */
    constructor(delay: number = 10_000, customEvents?: vscode.Event<any>[]) {
        // This ensures we don't fire a user activity event more than once per delay.
        const throttledEmit = _.throttle(
            (event: vscode.Event<any>) => {
                this.activityEvent.fire()
                getLogger().debug(`ExtensionUserActivity: event fired "${event.name}"`)
            },
            delay,
            { leading: true, trailing: false }
        )

        if (customEvents) {
            customEvents.forEach(event =>
                this.register(
                    event(() => {
                        throttledEmit(event)
                    })
                )
            )
        } else {
            this.registerAllEvents(throttledEmit)
        }

        this.disposables.push(this.activityEvent)
    }

    /**
     * Registers events that have conditions if they should even fire
     */
    private registerAllEvents(throttledEmit: (e: vscode.Event<any>) => any) {
        this.activityEvents.forEach(event =>
            this.register(
                event(() => {
                    throttledEmit(event)
                })
            )
        )

        /** ---- Events with edge cases ---- */
        this.register(
            vscode.window.onDidChangeWindowState(e => {
                if ((e as any).active === false) {
                    return
                }
                throttledEmit(vscode.window.onDidChangeWindowState)
            })
        )

        this.register(
            vscode.workspace.onDidChangeTextDocument(e => {
                // Our extension may change a file in the background (eg: log file)
                const uriOfDocumentUserIsEditing = vscode.window.activeTextEditor?.document?.uri
                if (!uriOfDocumentUserIsEditing) {
                    // User was not editing any file themselves
                    return
                }
                if (uriOfDocumentUserIsEditing !== e.document.uri) {
                    // File changed was not the one the user was actively working on
                    return
                }
                throttledEmit(vscode.workspace.onDidChangeTextDocument)
            })
        )

        this.register(
            vscode.window.onDidChangeTextEditorSelection(e => {
                if (e.textEditor.document.uri.scheme === 'output') {
                    // Ignore `output` scheme as text editors from output panel autoscroll
                    return
                }
                throttledEmit(vscode.window.onDidChangeTextEditorSelection)
            })
        )

        this.register(
            vscode.window.onDidChangeTextEditorVisibleRanges(e => {
                if (e.textEditor.document.uri.scheme === 'output') {
                    // Ignore `output` scheme as text editors from output panel autoscroll
                    return
                }
                throttledEmit(vscode.window.onDidChangeTextEditorVisibleRanges)
            })
        )
    }

    private activityEvents: vscode.Event<any>[] = [
        vscode.window.onDidChangeActiveColorTheme,
        vscode.window.onDidChangeActiveTextEditor,
        vscode.window.onDidChangeActiveTerminal,
        vscode.window.onDidChangeVisibleTextEditors,
        vscode.window.onDidChangeTextEditorOptions,
        vscode.window.onDidOpenTerminal,
        vscode.window.onDidCloseTerminal,
        vscode.window.onDidChangeTerminalState,
        vscode.window.onDidChangeTextEditorViewColumn,
        vscode.workspace.onDidOpenTextDocument,
    ]

    private register(disposable: vscode.Disposable) {
        this.disposables.push(disposable)
    }

    dispose() {
        this.disposables.forEach(d => d.dispose())
    }
}
