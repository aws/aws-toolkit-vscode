/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as config from './config'
import { createCommonButtons } from '../shared/ui/buttons'
import { createQuickPick } from '../shared/ui/pickerPrompter'
import { SkipPrompter } from '../shared/ui/common/skipPrompter'
import { DevSettings } from '../shared/settings'
import { FileProvider, VirtualFileSystem } from '../shared/virtualFilesystem'
import { Commands } from '../shared/vscode/commands2'
import { createInputBox } from '../shared/ui/inputPrompter'
import { Wizard } from '../shared/wizards/wizard'
import { deleteDevEnvCommand, installVsixCommand, openTerminalCommand } from './codecatalyst'
import { watchBetaVSIX } from './beta'
import { isCloud9 } from '../shared/extensionUtilities'
import { isReleaseVersion } from '../shared/vscode/env'
import { isAnySsoConnection } from '../auth/connection'
import { Auth } from '../auth/auth'
import { getLogger } from '../shared/logger'
import { entries } from '../shared/utilities/tsUtils'
import { getEnvironmentSpecificMemento } from '../shared/utilities/mementos'

interface MenuOption {
    readonly label: string
    readonly description?: string
    readonly detail?: string
    readonly executor: (ctx: vscode.ExtensionContext) => Promise<unknown> | unknown
}

export type DevFunction =
    | 'installVsix'
    | 'openTerminal'
    | 'deleteDevEnv'
    | 'editStorage'
    | 'showEnvVars'
    | 'deleteSsoConnections'
    | 'expireSsoConnections'
    | 'editAuthConnections'

let targetContext: vscode.ExtensionContext

/**
 * Defines AWS Toolkit developer tools.
 *
 * Options are displayed as quick-pick items. The {@link MenuOption.executor} callback is ran
 * on selection. There is no support for name-spacing. Just add the relevant
 * feature/module as a description so it can be moved around easier.
 */
const menuOptions: Record<DevFunction, MenuOption> = {
    installVsix: {
        label: 'Install VSIX on Remote Environment',
        description: 'CodeCatalyst',
        detail: 'Automatically upload/install a VSIX to a remote host',
        executor: installVsixCommand,
    },
    openTerminal: {
        label: 'Open Remote Terminal',
        description: 'CodeCatalyst',
        detail: 'Opens a new terminal connected to the remote environment',
        executor: openTerminalCommand,
    },
    deleteDevEnv: {
        label: 'Delete Workspace',
        description: 'CodeCatalyst',
        detail: 'Deletes the selected Dev Environment',
        executor: deleteDevEnvCommand,
    },
    editStorage: {
        label: 'Show or Edit globalState',
        description: 'VS Code',
        detail: 'Shows all globalState values, or edit a globalState/secret item',
        executor: openStorageFromInput,
    },
    showEnvVars: {
        label: 'Show Environment Variables',
        description: 'AWS Toolkit',
        detail: 'Shows all environment variable values',
        executor: () => showState('envvars'),
    },
    deleteSsoConnections: {
        label: 'Auth: Delete SSO Connections',
        detail: 'Deletes all SSO Connections the extension is using.',
        executor: deleteSsoConnections,
    },
    expireSsoConnections: {
        label: 'Auth: Expire SSO Connections',
        detail: 'Force expires all SSO Connections, in to a "needs reauthentication" state.',
        executor: expireSsoConnections,
    },
    editAuthConnections: {
        label: 'Auth: Edit Connections',
        detail: 'Opens editor to all Auth Connections the extension is using.',
        executor: editSsoConnections,
    },
}

/**
 * Provides (readonly, as opposed to `ObjectEditor`) content for the aws-dev2:/ URI scheme.
 *
 * ```
 * aws-dev2:/state/envvars
 * aws-dev2:/state/globalstate
 * ```
 *
 * TODO: This only purpose of this provider is to avoid an annoying unsaved, empty document that
 * re-appears after vscode restart. Ideally there should be only one scheme (aws-dev:/).
 */
export class DevDocumentProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
        if (uri.path.startsWith('/envvars')) {
            let s = 'Environment variables known to AWS Toolkit:\n\n'
            for (const [k, v] of Object.entries(process.env)) {
                s += `${k}=${v}\n`
            }
            return s
        } else if (uri.path.startsWith('/globalstate')) {
            // lol hax
            // as of November 2023, all of a memento's properties are stored as property `f` when minified
            return JSON.stringify((targetContext.globalState as any).f, undefined, 4)
        } else {
            return `unknown URI path: ${uri}`
        }
    }
}

/**
 * Enables internal developer tools.
 *
 * Commands prefixed with `AWS (Developer)` will appear so long as a developer setting is active.
 *
 * See {@link DevSettings} for more information.
 */
export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
    const devSettings = DevSettings.instance

    ctx.subscriptions.push(
        devSettings.onDidChangeActiveSettings(updateDevMode),
        vscode.workspace.registerTextDocumentContentProvider('aws-dev2', new DevDocumentProvider()),
        // "AWS (Developer): Open Developer Menu"
        vscode.commands.registerCommand('aws.dev.openMenu', async () => {
            await vscode.commands.executeCommand('_aws.dev.invokeMenu', ctx)
        }),
        // Internal command to open dev menu for a specific context and options
        vscode.commands.registerCommand(
            '_aws.dev.invokeMenu',
            (ctx: vscode.ExtensionContext, options: DevFunction[] = Object.keys(menuOptions) as DevFunction[]) => {
                targetContext = ctx
                void openMenu(
                    entries(menuOptions)
                        .filter(e => options.includes(e[0]))
                        .map(e => e[1])
                )
            }
        ),
        // "AWS (Developer): Watch Logs"
        Commands.register('aws.dev.viewLogs', async () => {
            // HACK: Use startDebugging() so we can use the DEBUG CONSOLE (which supports
            // user-defined filtering, unlike the OUTPUT panel).
            await vscode.debug.startDebugging(undefined, {
                name: 'aws-dev-log',
                request: 'launch',
                type: 'node', // Nonsense, to force the debugger to start.
            })
            getLogger().enableDebugConsole()
            if (!getLogger().logLevelEnabled('debug')) {
                getLogger().setLogLevel('debug')
            }
        })
    )

    await updateDevMode()

    const editor = new ObjectEditor()
    ctx.subscriptions.push(openStorageCommand.register(editor))

    if (!isCloud9() && !isReleaseVersion() && config.betaUrl) {
        ctx.subscriptions.push(watchBetaVSIX(config.betaUrl))
    }
}

async function openMenu(options: MenuOption[]): Promise<void> {
    const items = options.map(v => ({
        label: v.label,
        detail: v.detail,
        description: v.description,
        skipEstimate: true,
        data: v.executor,
    }))

    const prompter = createQuickPick(items, {
        title: 'Developer Menu',
        buttons: createCommonButtons(),
        matchOnDescription: true,
        matchOnDetail: true,
    })

    await prompter.prompt()
}

function isSecrets(obj: vscode.Memento | vscode.SecretStorage): obj is vscode.SecretStorage {
    return (obj as vscode.SecretStorage).store !== undefined
}

class VirtualObjectFile implements FileProvider {
    private mTime = 0
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event

    public constructor(private readonly storage: vscode.Memento | vscode.SecretStorage, private readonly key: string) {}

    /** Emits an event indicating this file's content has changed */
    public refresh() {
        /**
         * Per {@link vscode.FileSystemProvider.onDidChangeFile}, if the mTime does not change, new file content may
         * not be retrieved. Without this, when we emit a change the text editor did not update.
         */
        this.mTime++
        this.onDidChangeEmitter.fire()
    }

    public stat(): { ctime: number; mtime: number; size: number } {
        // This would need to be filled out to track conflicts
        return { ctime: 0, mtime: this.mTime, size: 0 }
    }

    public async read(): Promise<Uint8Array> {
        const encoder = new TextEncoder()

        return encoder.encode(await this.readStore(this.key))
    }

    public async write(content: Uint8Array): Promise<void> {
        const decoder = new TextDecoder()
        const value = JSON.parse(decoder.decode(content))

        await this.updateStore(this.key, value)
        this.refresh()
    }

    private async readStore(key: string): Promise<string> {
        // Could potentially show `undefined` in the editor instead of an empty string
        if (isSecrets(this.storage)) {
            const value = (await this.storage.get(key)) ?? ''
            return JSON.stringify(JSON.parse(value), undefined, 4)
        } else {
            if (key === '') {
                return '(empty key)'
            }
            return JSON.stringify(this.storage.get(key, {}), undefined, 4)
        }
    }

    private async updateStore(key: string, value: unknown): Promise<unknown> {
        if (isSecrets(this.storage)) {
            return this.storage.store(key, JSON.stringify(value))
        } else {
            return this.storage.update(key, value)
        }
    }
}

interface Tab {
    readonly editor: vscode.TextEditor
    readonly virtualFile: VirtualObjectFile
    dispose(): void
}

class ObjectEditor {
    private static readonly scheme = 'aws-dev'

    private readonly fs = new VirtualFileSystem()
    private readonly tabs: Map<string, Tab> = new Map()

    public constructor() {
        vscode.workspace.onDidCloseTextDocument(doc => {
            const key = this.fs.uriToKey(doc.uri)
            this.tabs.get(key)?.dispose()
            this.tabs.delete(key)
        })

        vscode.workspace.registerFileSystemProvider(ObjectEditor.scheme, this.fs)
    }

    public async openStorage(type: 'globalsView' | 'globals' | 'secrets' | 'auth', key: string): Promise<void> {
        switch (type) {
            case 'globalsView':
                return showState('globalstate')
            case 'globals':
                return this.openState(targetContext.globalState, key)
            case 'secrets':
                return this.openState(targetContext.secrets, key)
            case 'auth':
                // Auth memento is determined in a different way
                return this.openState(getEnvironmentSpecificMemento(), key)
        }
    }

    private async openState(storage: vscode.Memento | vscode.SecretStorage, key: string): Promise<void> {
        const uri = this.uriFromKey(key, storage)
        const tab = this.tabs.get(this.fs.uriToKey(uri))

        if (tab) {
            tab.virtualFile.refresh()
            await vscode.window.showTextDocument(tab.editor.document)
        } else {
            const newTab = await this.createTab(storage, key)
            const newKey = this.fs.uriToKey(newTab.editor.document.uri)
            this.tabs.set(newKey, newTab)
        }
    }

    private async createTab(storage: vscode.Memento | vscode.SecretStorage, key: string): Promise<Tab> {
        const virtualFile = new VirtualObjectFile(storage, key)
        let disposable: vscode.Disposable
        let document: vscode.TextDocument
        if (key !== '') {
            const uri = this.uriFromKey(key, storage)
            disposable = this.fs.registerProvider(uri, virtualFile)
            document = await vscode.workspace.openTextDocument(uri)
        } else {
            // don't tie it to a URI so you can't save this view
            const stream = await virtualFile.read()
            document = await vscode.workspace.openTextDocument({
                content: new TextDecoder().decode(stream),
            })
        }
        const withLanguage = await vscode.languages.setTextDocumentLanguage(document, 'json')

        return {
            editor: await vscode.window.showTextDocument(withLanguage),
            virtualFile,
            dispose: () => disposable.dispose(),
        }
    }

    private uriFromKey(key: string, storage: vscode.Memento | vscode.SecretStorage): vscode.Uri {
        const prefix = isSecrets(storage) ? 'secrets' : 'globals'

        return vscode.Uri.parse(`${ObjectEditor.scheme}:`, true).with({
            path: `/${prefix}/${key}-${targetContext.extension.id}`,
        })
    }
}

async function openStorageFromInput() {
    const wizard = new (class extends Wizard<{ target: 'globalsView' | 'globals' | 'secrets'; key: string }> {
        constructor() {
            super()

            this.form.target.bindPrompter(() =>
                createQuickPick(
                    [
                        { label: 'Show all globalState', data: 'globalsView' },
                        { label: 'Edit globalState', data: 'globals' },
                        { label: 'Secrets', data: 'secrets' },
                    ],
                    {
                        title: 'Select a storage type',
                    }
                )
            )

            this.form.key.bindPrompter(({ target }) => {
                if (target === 'secrets') {
                    return createInputBox({
                        title: 'Enter a key',
                    })
                } else if (target === 'globalsView') {
                    return new SkipPrompter('')
                } else if (target === 'globals') {
                    // List all globalState keys in the quickpick menu.
                    const items = targetContext.globalState
                        .keys()
                        .map(key => {
                            return {
                                label: key,
                                data: key,
                            }
                        })
                        .sort((a, b) => {
                            return a.data.localeCompare(b.data)
                        })

                    return createQuickPick(items, { title: 'Select a key' })
                } else {
                    throw new Error('invalid storage target')
                }
            })
        }
    })()

    const response = await wizard.run()

    if (response) {
        return openStorageCommand.execute(response.target, response.key)
    }
}

async function editSsoConnections() {
    void openStorageCommand.execute('auth', 'auth.profiles')
}

async function deleteSsoConnections() {
    const conns = Auth.instance.listConnections()
    const ssoConns = (await conns).filter(isAnySsoConnection)
    await Promise.all(ssoConns.map(conn => Auth.instance.deleteConnection(conn)))
    void vscode.window.showInformationMessage(`Deleted: ${ssoConns.map(c => c.startUrl).join(', ')}`)
}

async function expireSsoConnections() {
    const conns = Auth.instance.listConnections()
    const ssoConns = (await conns).filter(isAnySsoConnection)
    await Promise.all(ssoConns.map(conn => Auth.instance.expireConnection(conn)))
    void vscode.window.showInformationMessage(`Expired: ${ssoConns.map(c => c.startUrl).join(', ')}`)
}

async function showState(path: string) {
    const uri = vscode.Uri.parse(`aws-dev2://state/${path}-${targetContext.extension.id}`)
    const doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc, { preview: false })
}

export const openStorageCommand = Commands.from(ObjectEditor).declareOpenStorage('_aws.dev.openStorage')

export async function updateDevMode() {
    await vscode.commands.executeCommand('setContext', 'aws.isDevMode', DevSettings.instance.isDevMode())
}
