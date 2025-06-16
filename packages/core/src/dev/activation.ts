/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createCommonButtons } from '../shared/ui/buttons'
import { createQuickPick } from '../shared/ui/pickerPrompter'
import { SkipPrompter } from '../shared/ui/common/skipPrompter'
import { DevSettings } from '../shared/settings'
import { FileProvider, VirtualFileSystem } from '../shared/virtualFilesystem'
import { Commands } from '../shared/vscode/commands2'
import { createInputBox } from '../shared/ui/inputPrompter'
import { Wizard } from '../shared/wizards/wizard'
import { deleteDevEnvCommand, installVsixCommand, openTerminalCommand } from './codecatalyst'
import { isAnySsoConnection } from '../auth/connection'
import { Auth } from '../auth/auth'
import { getLogger } from '../shared/logger/logger'
import { entries } from '../shared/utilities/tsUtils'
import { getEnvironmentSpecificMemento } from '../shared/utilities/mementos'
import { setContext } from '../shared/vscode/setContext'
import { telemetry } from '../shared/telemetry/telemetry'
import { getSessionId } from '../shared/telemetry/util'
import { NotificationsController } from '../notifications/controller'
import { DevNotificationsState } from '../notifications/types'
import { QuickPickItem } from 'vscode'
import { ChildProcess } from '../shared/utilities/processUtils'

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
    | 'resetState'
    | 'showEnvVars'
    | 'deleteSsoConnections'
    | 'expireSsoConnections'
    | 'editAuthConnections'
    | 'notificationsSend'
    | 'forceIdeCrash'
    | 'startChildProcess'

export type DevOptions = {
    context: vscode.ExtensionContext
    auth: () => Auth
    notificationsController: () => NotificationsController
    menuOptions?: DevFunction[]
}

let targetContext: vscode.ExtensionContext
let globalState: vscode.Memento
let targetAuth: Auth
let targetNotificationsController: NotificationsController

/**
 * Defines AWS Toolkit developer tools.
 *
 * Options are displayed as quick-pick items. The {@link MenuOption.executor} callback is ran
 * on selection. There is no support for name-spacing. Just add the relevant
 * feature/module as a description so it can be moved around easier.
 */
const menuOptions: () => Record<DevFunction, MenuOption> = () => {
    return {
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
        resetState: {
            label: 'Reset feature state',
            detail: 'Quick reset the state of extension components or features',
            executor: resetState,
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
        notificationsSend: {
            label: 'Notifications: Send Notifications',
            detail: 'Send JSON notifications for testing.',
            executor: editNotifications,
        },
        forceIdeCrash: {
            label: 'Crash: Force IDE ExtHost Crash',
            detail: `Will SIGKILL ExtHost, { pid: ${process.pid}, sessionId: '${getSessionId().slice(0, 8)}-...' }, but the IDE itself will not crash.`,
            executor: forceQuitIde,
        },
        startChildProcess: {
            label: 'ChildProcess: Start child process',
            detail: 'Start ChildProcess from our utility wrapper for testing',
            executor: startChildProcess,
        },
    }
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
            return JSON.stringify((globalState as any).f, undefined, 4)
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
            await vscode.commands.executeCommand('_aws.dev.invokeMenu', {
                context: ctx,
                auth: () => Auth.instance,
                notificationsController: () => NotificationsController.instance,
            })
        }),
        // Internal command to open dev menu for a specific context and options
        vscode.commands.registerCommand('_aws.dev.invokeMenu', (opts: DevOptions) => {
            targetContext = opts.context
            // eslint-disable-next-line aws-toolkits/no-banned-usages
            globalState = targetContext.globalState
            targetAuth = opts.auth()
            targetNotificationsController = opts.notificationsController()
            const options = menuOptions()
            void openMenu(
                entries(options)
                    .filter((e) => (opts.menuOptions ?? Object.keys(options)).includes(e[0]))
                    .map((e) => e[1])
            )
        })
    )

    await updateDevMode()

    const editor = new ObjectEditor()
    ctx.subscriptions.push(openStorageCommand.register(editor))
}

async function openMenu(options: MenuOption[]): Promise<void> {
    const items = options.map((v) => ({
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
    private size = 0
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event

    public constructor(
        private readonly storage: vscode.Memento | vscode.SecretStorage,
        private readonly key: string
    ) {}

    /** Emits an event indicating this file's content has changed */
    public refresh() {
        /**
         * Per {@link vscode.FileSystemProvider.onDidChangeFile}, if the mTime and/or size does not change, new file content may
         * not be retrieved due to optimizations. Without this, when we emit a change the text editor did not update.
         */
        this.mTime++
        this.onDidChangeEmitter.fire()
    }

    public stat(): { ctime: number; mtime: number; size: number } {
        // This would need to be filled out to track conflicts
        return { ctime: 0, mtime: this.mTime, size: this.size }
    }

    public async read(): Promise<Uint8Array> {
        const encoder = new TextEncoder()

        const data = encoder.encode(await this.readStore(this.key))
        this.size = data.length
        return data
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
        vscode.workspace.onDidCloseTextDocument((doc) => {
            const key = this.fs.uriToKey(doc.uri)
            this.tabs.get(key)?.dispose()
            this.tabs.delete(key)
        })

        vscode.workspace.registerFileSystemProvider(ObjectEditor.scheme, this.fs)
    }

    public async openStorage(type: 'globalsView' | 'globals' | 'secrets' | 'auth', key: string) {
        switch (type) {
            case 'globalsView':
                return showState('globalstate')
            case 'globals':
                return this.openState(globalState, key)
            case 'secrets':
                return this.openState(targetContext.secrets, key)
            case 'auth':
                // Auth memento is determined in a different way
                return this.openState(getEnvironmentSpecificMemento(globalState), key)
        }
    }

    private async openState(storage: vscode.Memento | vscode.SecretStorage, key: string) {
        const uri = this.uriFromKey(key, storage)
        const tab = this.tabs.get(this.fs.uriToKey(uri))

        if (tab) {
            tab.virtualFile.refresh()
            await vscode.window.showTextDocument(tab.editor.document)
            return tab.virtualFile
        } else {
            const newTab = await this.createTab(storage, key)
            const newKey = this.fs.uriToKey(newTab.editor.document.uri)
            this.tabs.set(newKey, newTab)
            return newTab.virtualFile
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
                    return new SkipPrompter()
                } else if (target === 'globals') {
                    // List all globalState keys in the quickpick menu.
                    const items = globalState
                        .keys()
                        .map((key) => {
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

type ResettableFeature = {
    name: string
    executor: () => Promise<void> | void
} & QuickPickItem

/**
 * Extend this array with features that may need state resets often for
 * testing purposes. It will appear as an entry in the "Reset feature state" menu.
 */
const resettableFeatures: readonly ResettableFeature[] = [
    {
        name: 'notifications',
        label: 'Notifications',
        detail: 'Resets memory/global state for the notifications panel (includes dismissed, onReceive).',
        executor: resetNotificationsState,
    },
] as const

// TODO this is *somewhat* similar to `openStorageFromInput`. If we need another
// one of these prompters, can we make it generic?
async function resetState() {
    const wizard = new (class extends Wizard<{ target: string; key: string }> {
        constructor() {
            super()

            this.form.target.bindPrompter(() =>
                createQuickPick(
                    resettableFeatures.map((f) => {
                        return {
                            data: f.name,
                            label: f.label,
                            detail: f.detail,
                        }
                    }),
                    {
                        title: 'Select a feature/component to reset',
                    }
                )
            )

            this.form.key.bindPrompter(({ target }) => {
                if (target && resettableFeatures.some((f) => f.name === target)) {
                    return new SkipPrompter()
                }
                throw new Error('invalid feature target')
            })
        }
    })()

    const response = await wizard.run()

    if (response) {
        return resettableFeatures.find((f) => f.name === response.target)?.executor()
    }
}

async function editSsoConnections() {
    void openStorageCommand.execute('auth', 'auth.profiles')
}

async function deleteSsoConnections() {
    const conns = targetAuth.listConnections()
    const ssoConns = (await conns).filter(isAnySsoConnection)
    await Promise.all(ssoConns.map((conn) => targetAuth.deleteConnection(conn)))
    void vscode.window.showInformationMessage(`Deleted: ${ssoConns.map((c) => c.startUrl).join(', ')}`)
}

async function expireSsoConnections() {
    return telemetry.function_call.run(
        async () => {
            const conns = targetAuth.listConnections()
            const ssoConns = (await conns).filter(isAnySsoConnection)
            await Promise.all(ssoConns.map((conn) => targetAuth.expireConnection(conn)))
            void vscode.window.showInformationMessage(`Expired: ${ssoConns.map((c) => c.startUrl).join(', ')}`)
        },
        { emit: false, functionId: { name: 'expireSsoConnectionsDev' } }
    )
}

export function forceQuitIde() {
    // This current process is the ExtensionHost. Killing it will cause all the extensions to crash
    // for the current ExtensionHost (unless using "extensions.experimental.affinity").
    // The IDE instance itself will remaing running, but a new ExtHost will spawn within it.
    // The PPID (parent process) is vscode itself, killing it crashes all vscode instances.
    const vsCodePid = process.pid
    process.kill(vsCodePid, 'SIGKILL') // SIGTERM would be the graceful shutdown
}

async function showState(path: string) {
    const uri = vscode.Uri.parse(`aws-dev2://state/${path}-${targetContext.extension.id}`)
    const doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc, { preview: false })
}

export const openStorageCommand = Commands.from(ObjectEditor).declareOpenStorage('_aws.dev.openStorage')

export async function updateDevMode() {
    await setContext('aws.isDevMode', DevSettings.instance.isDevMode())
}

async function resetNotificationsState() {
    await targetNotificationsController.reset()
}

async function editNotifications() {
    const storageKey = 'aws.notifications.dev'
    const current = globalState.get(storageKey) ?? {}
    const isValid = (item: any) => {
        if (typeof item !== 'object' || !Array.isArray(item.startUp) || !Array.isArray(item.emergency)) {
            return false
        }
        return true
    }
    if (!isValid(current)) {
        // Set a default state if the developer does not have it or it's malformed.
        await globalState.update(storageKey, { startUp: [], emergency: [] } as DevNotificationsState)
    }

    // Monitor for when the global state is updated.
    // A notification will be sent based on the contents.
    const virtualFile = await openStorageCommand.execute('globals', storageKey)
    virtualFile?.onDidChange(async () => {
        const val = globalState.get(storageKey) as DevNotificationsState
        if (!isValid(val)) {
            void vscode.window.showErrorMessage(
                'Dev mode: invalid notification object provided. State data must take the form: { "startUp": ToolkitNotification[], "emergency": ToolkitNotification[] }'
            )
            return
        }

        // This relies on the controller being built with DevFetcher, as opposed to
        // the default RemoteFetcher. DevFetcher will check for notifications in the
        // global state, which was just modified.
        await targetNotificationsController.pollForStartUp()
        await targetNotificationsController.pollForEmergencies()
    })
}

async function startChildProcess() {
    const result = await createInputBox({
        title: 'Enter a command',
    }).prompt()
    if (result) {
        const [command, ...args] = result?.toString().split(' ') ?? []
        getLogger().info(`Starting child process: '${command}'`)
        const processResult = await ChildProcess.run(command, args, { collect: true })
        getLogger().info(`Child process exited with code ${processResult.exitCode}`)
    }
}
