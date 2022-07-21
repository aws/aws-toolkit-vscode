/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext, VSCODE_EXTENSION_ID } from '../shared/extensions'
import { createCommonButtons } from '../shared/ui/buttons'
import { createQuickPick } from '../shared/ui/pickerPrompter'
import { isValidResponse } from '../shared/wizards/wizard'

// CAWS imports
// Planning on splitting this file up.
import { DevelopmentWorkspace, ConnectedCawsClient } from '../shared/clients/cawsClient'
import * as glob from 'glob'
import * as fs from 'fs-extra'
import * as path from 'path'
import { promisify } from 'util'
import * as manifest from '../../package.json'
import { getLogger } from '../shared/logger'
import { selectCawsResource } from '../caws/wizards/selectResource'
import { createBoundProcess, createCawsEnvProvider, getHostNameFromEnv } from '../caws/model'
import { ChildProcess } from '../shared/utilities/childProcess'
import { Timeout } from '../shared/utilities/timeoutUtils'
import { CawsCommands } from '../caws/commands'
import { showViewLogsMessage } from '../shared/utilities/messages'
import { DevSettings } from '../shared/settings'
import { FileProvider, VirualFileSystem } from '../shared/virtualFilesystem'
import { Commands } from '../shared/vscode/commands2'
import { createInputBox } from '../shared/ui/inputPrompter'
import { Wizard } from '../shared/wizards/wizard'
import { ensureDependencies } from '../caws/tools'
import { startVscodeRemote } from '../shared/extensions/ssh'

interface MenuOption {
    readonly label: string
    readonly description?: string
    readonly detail?: string
    readonly executor: (ctx: ExtContext) => Promise<unknown> | unknown
}

/**
 * Currently contains all known developer tools.
 *
 * Options are displayed as quick-pick items. The {@link MenuOption.executor} callback is ran
 * if the user selects an option. There is no support for name-spacing. Just add the relevant
 * feature/module as a description so it can be moved around easier.
 */
const menuOptions: Record<string, MenuOption> = {
    installVsix: {
        label: 'Install VSIX on Remote Environment',
        description: 'REMOVED.codes',
        detail: 'Automatically upload/install a VSIX to a remote host',
        executor: installVsixCommand,
    },
    openTerminal: {
        label: 'Open Remote Terminal',
        description: 'REMOVED.codes',
        detail: 'Open a new terminal connected to the remote environment',
        executor: openTerminalCommand,
    },
    editStorage: {
        label: 'Edit Storage',
        description: 'VS Code',
        detail: 'Edit a key in global/secret storage as a JSON document',
        executor: openStorageFromInput,
    },
}

/**
 * Enables internal developer tools.
 *
 * Commands prefixed with `AWS (Developer)` will appear so long as a developer setting is active.
 *
 * See {@link DevSettings} for more information.
 */
export function activate(ctx: ExtContext): void {
    const devSettings = DevSettings.instance

    async function updateMode() {
        const enablement = Object.keys(devSettings.activeSettings).length > 0
        await vscode.commands.executeCommand('setContext', 'aws.isDevMode', enablement)
    }

    ctx.extensionContext.subscriptions.push(
        devSettings.onDidChangeActiveSettings(updateMode),
        vscode.commands.registerCommand('aws.dev.openMenu', () => openMenu(ctx, menuOptions))
    )

    updateMode()

    const editor = new ObjectEditor(ctx.extensionContext)
    ctx.extensionContext.subscriptions.push(openStorageCommand.register(editor))
}

function entries<T extends Record<string, U>, U>(obj: T): { [P in keyof T]: [P, T[P]] }[keyof T][] {
    return Object.entries(obj) as { [P in keyof T]: [P, T[P]] }[keyof T][]
}

async function openMenu(ctx: ExtContext, options: typeof menuOptions): Promise<void> {
    const items = entries(options).map(([_, v]) => ({
        label: v.label,
        detail: v.detail,
        description: v.description,
        skipEstimate: true,
        data: v.executor.bind(undefined, ctx),
    }))

    const prompter = createQuickPick(items, {
        title: 'Developer Menu',
        buttons: createCommonButtons(),
    })

    await prompter.prompt()
}

type LazyProgress<T> = vscode.Progress<T> & vscode.Disposable & { getToken(): Timeout }

function lazyProgress<T>(timeout: Timeout): LazyProgress<T> {
    let dispose!: () => void
    let progress: vscode.Progress<T>
    const location = vscode.ProgressLocation.Notification
    const thenable = new Promise<void>(resolve => {
        dispose = resolve
        timeout.token.onCancellationRequested(() => resolve)
    })

    return {
        dispose,
        getToken: () => timeout,
        report: value => {
            if (!progress) {
                vscode.window.withProgress({ location, cancellable: true }, (p, t) => {
                    progress = p
                    t.onCancellationRequested(e => timeout.cancel())
                    return thenable
                })
            }
            progress.report(value)
        },
    }
}

async function openTerminalCommand(ctx: ExtContext) {
    const commands = CawsCommands.fromContext(ctx.extensionContext)
    const progress = lazyProgress<{ message: string }>(new Timeout(900000))

    await commands.withClient(openTerminal, progress).finally(() => progress.dispose())
}

async function openTerminal(client: ConnectedCawsClient, progress: LazyProgress<{ message: string }>) {
    const env = await selectCawsResource(client, 'developmentWorkspace')
    if (!env) {
        return
    }

    const runningEnv = await client.startWorkspaceWithProgress(
        {
            id: env.id,
            organizationName: env.org.name,
            projectName: env.project.name,
        },
        'RUNNING'
    )

    if (!runningEnv) {
        return
    }

    progress.report({ message: 'Checking dependencies...' })

    const deps = (await ensureDependencies()).unwrap()

    progress.report({ message: 'Opening terminal...' })

    const { ssh, ssm } = deps
    const envVars = await createCawsEnvProvider(client, ssm, runningEnv)()

    const options: vscode.TerminalOptions = {
        name: `Remote Connection (${env.id})`,
        shellPath: ssh,
        shellArgs: [getHostNameFromEnv(env)],
        env: envVars as Record<string, string>,
    }

    // Running `exit` in the terminal reports an error unfortunately. Not sure if there's an
    // easy solution besides wrapping `ssh` with a shell script to trap the exit code.
    // Or use a pseudoterminal.
    vscode.window.createTerminal(options).show()
}

async function installVsixCommand(ctx: ExtContext) {
    const commands = CawsCommands.fromContext(ctx.extensionContext)

    await commands.withClient(async client => {
        const env = await selectCawsResource(client, 'developmentWorkspace')
        if (!env) {
            return
        }
        const progress = lazyProgress<{ message: string }>(new Timeout(900000))

        try {
            await installVsix(ctx, client, progress, env).finally(() => progress.dispose())
        } catch (err) {
            getLogger().error(`installVsixCommand: installation failed: %O`, err)
            showViewLogsMessage('VSIX installation failed')
        }
    })
}

async function promptVsix(
    ctx: ExtContext,
    progress?: LazyProgress<{ message: string }>
): Promise<vscode.Uri | undefined> {
    const folders = (vscode.workspace.workspaceFolders ?? [])
        .map(f => f.uri)
        .concat(vscode.Uri.file(ctx.extensionContext.extensionPath))

    enum ExtensionMode {
        Production = 1,
        Development = 2,
        Test = 3,
    }

    const isDevelopmentWindow = ctx.extensionContext.extensionMode === ExtensionMode.Development
    const extPath = isDevelopmentWindow ? ctx.extensionContext.extensionPath : folders[0].fsPath

    const packageNew = {
        label: 'Create new VSIX',
        detail: extPath,
        description: 'Important: this currently breaks any running `watch` tasks',
        skipEstimate: true,
        data: async () => {
            progress?.report({ message: 'Running package script...' })
            const process = new ChildProcess('npm', ['run', 'package', '--', '--no-clean'], {
                spawnOptions: { cwd: extPath },
            })
            const vsixUri = new Promise<vscode.Uri>(async (resolve, reject) => {
                await process
                    .run({
                        timeout: progress?.getToken(),
                        rejectOnErrorCode: true,
                        onStdout(text) {
                            getLogger().info(text, { raw: true })
                            const match = text.match(/VSIX Version: ([\w\-\.]+)/)
                            if (match?.[1]) {
                                try {
                                    resolve(vscode.Uri.file(path.join(extPath, `${manifest.name}-${match[1]}.vsix`)))
                                } catch (e) {
                                    reject(e)
                                }
                            }
                        },
                        onStderr(text) {
                            getLogger().info(text, { raw: true })
                        },
                    })
                    .catch(reject)

                reject(new Error('Did not get VSIX version from "npm run package"'))
            })

            return vsixUri
        },
    }

    const localInstall = {
        label: 'Use local install (experimental)',
        detail: extPath,
        data: vscode.Uri.file(extPath),
    }

    const seps = [
        { label: 'Scripts', kind: -1, data: {} as any },
        { label: 'Packages', kind: -1, data: {} as any },
    ]
    const items = (async function* () {
        yield [seps.shift()!, packageNew, localInstall]

        for (const f of folders) {
            const paths = await promisify(glob)('*.vsix', { cwd: f.fsPath })
            const uris = paths.map(v => vscode.Uri.file(path.join(f.fsPath, v)))

            if (uris.length > 0 && seps.length > 0) {
                yield [seps.shift()!]
            }

            yield uris.map(v => ({
                label: path.basename(v.fsPath),
                detail: v.fsPath,
                data: v,
            }))
        }
    })()

    const prompter = createQuickPick(items, {
        title: 'Choose a script or VSIX',
        buttons: createCommonButtons(),
    })
    const resp = await prompter.prompt()

    return isValidResponse(resp) ? resp : undefined
}

function logOutput(prefix: string): (data: string) => void {
    return data => getLogger().verbose(`${prefix}: ${data}`)
}

/**
 * Bootstrap an environment for remote development/debugging
 */
async function installVsix(
    ctx: ExtContext,
    client: ConnectedCawsClient,
    progress: LazyProgress<{ message: string }>,
    env: DevelopmentWorkspace
): Promise<void> {
    const resp = await promptVsix(ctx, progress).then(r => r?.fsPath)

    if (!resp) {
        return
    }

    const { vsc, ssh, ssm } = (await ensureDependencies()).unwrap()

    progress.report({ message: 'Waiting...' })
    const runningEnv = await client.startWorkspaceWithProgress(
        {
            id: env.id,
            organizationName: env.org.name,
            projectName: env.project.name,
        },
        'RUNNING'
    )

    if (!runningEnv) {
        return
    }

    const envProvider = createCawsEnvProvider(client, ssm, env)
    const SessionProcess = createBoundProcess(envProvider).extend({
        timeout: progress.getToken(),
        onStdout: logOutput(`install: ${env.id}:`),
        onStderr: logOutput(`install (stderr): ${env.id}:`),
        rejectOnErrorCode: true,
    })

    const hostName = getHostNameFromEnv(env)

    progress.report({ message: 'Starting controller...' })

    const EXT_ID = VSCODE_EXTENSION_ID.awstoolkit
    const EXT_PATH = `/home/mde-user/.vscode-server/extensions`
    const userWithHost = `mde-user@${hostName}`

    if (path.extname(resp) !== '.vsix') {
        progress.report({ message: 'Copying extension...' })

        const packageData = await fs.readFile(path.join(resp, 'package.json'), 'utf-8')
        const targetManfiest: typeof manifest = JSON.parse(packageData)
        const destName = `${EXT_PATH}/${EXT_ID}-${targetManfiest.version}`
        const source = `${resp}${path.sep}`

        // Using `.vscodeignore` would be nice here but `rsync` doesn't understand glob patterns
        const excludes = ['.git/', 'node_modules/', '/src/', '/scripts/', '/dist/src/test/']
            .map(p => ['--exclude', p])
            .reduce((a, b) => a.concat(b))

        const installCommand = [`cd ${destName}`, 'npm i --ignore-scripts'].join(' && ')

        await new SessionProcess('ssh', [hostName, '-v', `mkdir -p ${destName}`]).run()
        await new SessionProcess('rsync', ['-vr', ...excludes, source, `${userWithHost}:${destName}`]).run()
        await new SessionProcess('ssh', [hostName, '-v', installCommand]).run()
    } else {
        progress.report({ message: 'Copying VSIX...' })
        const remoteVsix = `/projects/${path.basename(resp)}`

        await new SessionProcess('scp', ['-v', resp, `${userWithHost}:${remoteVsix}`]).run()

        const suffixParts = path
            .basename(resp)
            .split('-')
            .reverse()
            .slice(0, 2)
            .map(s => s.replace('.vsix', ''))
        const destName = [EXT_ID, ...suffixParts.reverse()].join('-')

        const installCmd = [
            `rm ${EXT_PATH}/.obsolete || true`,
            `find ${EXT_PATH} -type d -name '${EXT_ID}*' -exec rm -rf {} +`,
            `unzip ${remoteVsix} "extension/*" "extension.vsixmanifest" -d ${EXT_PATH}`,
            `mv ${EXT_PATH}/extension ${EXT_PATH}/${destName}`,
            `mv ${EXT_PATH}/extension.vsixmanifest ${EXT_PATH}/${destName}/.vsixmanifest`,
        ].join(' && ')

        progress.report({ message: 'Installing VSIX...' })
        await new SessionProcess(ssh, [`${hostName}`, '-v', installCmd]).run()
    }

    progress.report({ message: 'Launching instance...' })
    await startVscodeRemote(SessionProcess, hostName, '/projects', vsc)
}

function isSecrets(obj: vscode.Memento | vscode.SecretStorage): obj is vscode.SecretStorage {
    return (obj as vscode.SecretStorage).store !== undefined
}

class VirtualObjectFile implements FileProvider {
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.onDidChangeEmitter.event

    public constructor(private readonly storage: vscode.Memento | vscode.SecretStorage, private readonly key: string) {}

    public stat(): { ctime: number; mtime: number; size: number } {
        // This would need to be filled out to track conflicts
        return { ctime: 0, mtime: 0, size: 0 }
    }

    public async read(): Promise<Uint8Array> {
        const encoder = new TextEncoder()

        return encoder.encode(await this.readStore(this.key))
    }

    public async write(content: Uint8Array): Promise<void> {
        const decoder = new TextDecoder()
        const value = JSON.parse(decoder.decode(content))

        await this.updateStore(this.key, value)
    }

    private async readStore(key: string): Promise<string> {
        // Could potentially show `undefined` in the editor instead of an empty string
        if (isSecrets(this.storage)) {
            const value = (await this.storage.get(key)) ?? ''
            return JSON.stringify(JSON.parse(value), undefined, 4)
        } else {
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
    dispose(): void
}

class ObjectEditor {
    private static readonly scheme = 'aws-dev'

    private readonly fs = new VirualFileSystem()
    private readonly tabs: Map<string, Tab> = new Map()

    public constructor(private readonly context: vscode.ExtensionContext) {
        vscode.workspace.onDidCloseTextDocument(doc => {
            const key = this.fs.uriToKey(doc.uri)
            this.tabs.get(key)?.dispose()
            this.tabs.delete(key)
        })

        vscode.workspace.registerFileSystemProvider(ObjectEditor.scheme, this.fs)
    }

    public async openStorage(type: 'globals' | 'secrets', key: string): Promise<void> {
        switch (type) {
            case 'globals':
                return this.openState(this.context.globalState, key)
            case 'secrets':
                return this.openState(this.context.secrets, key)
        }
    }

    private async openState(storage: vscode.Memento | vscode.SecretStorage, key: string): Promise<void> {
        const uri = this.uriFromKey(key, storage)
        const tab = this.tabs.get(this.fs.uriToKey(uri))

        if (tab) {
            await vscode.window.showTextDocument(tab.editor.document)
        } else {
            const newTab = await this.createTab(storage, key)
            const newKey = this.fs.uriToKey(newTab.editor.document.uri)
            this.tabs.set(newKey, newTab)
        }
    }

    private async createTab(storage: vscode.Memento | vscode.SecretStorage, key: string): Promise<Tab> {
        const uri = this.uriFromKey(key, storage)
        const disposable = this.fs.registerProvider(uri, new VirtualObjectFile(storage, key))
        const document = await vscode.workspace.openTextDocument(uri)
        const withLanguage = await vscode.languages.setTextDocumentLanguage(document, 'json')
        const editor = await vscode.window.showTextDocument(withLanguage)

        return {
            editor,
            dispose: () => disposable.dispose(),
        }
    }

    private uriFromKey(key: string, storage: vscode.Memento | vscode.SecretStorage): vscode.Uri {
        const prefix = isSecrets(storage) ? 'secrets' : 'globals'

        return vscode.Uri.parse(`${ObjectEditor.scheme}:`, true).with({
            path: `/${prefix}/${key}`,
        })
    }
}

async function openStorageFromInput() {
    const wizard = new (class extends Wizard<{ target: 'globals' | 'secrets'; key: string }> {
        constructor() {
            super()

            this.form.target.bindPrompter(() =>
                createQuickPick(
                    [
                        { label: 'Global State', data: 'globals' },
                        { label: 'Secrets', data: 'secrets' },
                    ],
                    {
                        title: 'Select a storage type',
                    }
                )
            )

            this.form.key.bindPrompter(({ target }) =>
                createInputBox({
                    title: 'Enter a key',
                    placeholder: target === 'globals' ? 'region' : '',
                })
            )
        }
    })()

    const response = await wizard.run()

    if (response) {
        return openStorageCommand.execute(response.target, response.key)
    }
}

export const openStorageCommand = Commands.from(ObjectEditor).declareOpenStorage('_aws.dev.openStorage')
