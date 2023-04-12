/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as config from './config'
import { ExtContext } from '../shared/extensions'
import { createCommonButtons } from '../shared/ui/buttons'
import { createQuickPick } from '../shared/ui/pickerPrompter'
import { DevSettings } from '../shared/settings'
import { FileProvider, VirualFileSystem } from '../shared/virtualFilesystem'
import { Commands } from '../shared/vscode/commands2'
import { createInputBox } from '../shared/ui/inputPrompter'
import { Wizard } from '../shared/wizards/wizard'
import { deleteDevEnvCommand, installVsixCommand, openTerminalCommand } from './codecatalyst'
import { watchBetaVSIX } from './beta'
import { isCloud9 } from '../shared/extensionUtilities'
import { entries, isNonNullable } from '../shared/utilities/tsUtils'
import { isReleaseVersion } from '../shared/vscode/env'
import { ResourceTreeNode } from '../shared/treeview/resource'
import { isCancellable, isCompleted, Task, Tasks } from '../shared/tasks'
import { addColor, getIcon } from '../shared/icons'
import { RootNode } from '../awsexplorer/localExplorer'

interface MenuOption {
    readonly label: string
    readonly description?: string
    readonly detail?: string
    readonly executor: (ctx: ExtContext) => Promise<unknown> | unknown
}

/**
 * Defines AWS Toolkit developer tools.
 *
 * Options are displayed as quick-pick items. The {@link MenuOption.executor} callback is ran
 * on selection. There is no support for name-spacing. Just add the relevant
 * feature/module as a description so it can be moved around easier.
 */
const menuOptions: Record<string, MenuOption> = {
    installVsix: {
        label: 'Install VSIX on Remote Environment',
        description: 'CodeCatalyst',
        detail: 'Automatically upload/install a VSIX to a remote host',
        executor: installVsixCommand,
    },
    openTerminal: {
        label: 'Open Remote Terminal',
        description: 'CodeCatalyst',
        detail: 'Open a new terminal connected to the remote environment',
        executor: openTerminalCommand,
    },
    deleteDevEnv: {
        label: 'Delete Workspace',
        description: 'CodeCatalyst',
        detail: 'Deletes the selected Dev Environment',
        executor: deleteDevEnvCommand,
    },
    editStorage: {
        label: 'Edit Storage',
        description: 'VS Code',
        detail: 'Edit a key in global/secret storage as a JSON document',
        executor: openStorageFromInput,
    },
    showGlobalState: {
        label: 'Show Global State',
        description: 'AWS Toolkit',
        detail: 'Shows various state (including environment variables)',
        executor: showGlobalState,
    },
}

export class GlobalStateDocumentProvider implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
        let s = 'Environment variables known to AWS Toolkit:\n'
        for (const [k, v] of Object.entries(process.env)) {
            s += `${k}=${v}\n`
        }
        return s
    }
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
        vscode.commands.registerCommand('aws.dev.openMenu', () => openMenu(ctx, menuOptions)),
        vscode.workspace.registerTextDocumentContentProvider('aws-dev2', new GlobalStateDocumentProvider())
    )

    updateMode()

    const editor = new ObjectEditor(ctx.extensionContext)
    ctx.extensionContext.subscriptions.push(openStorageCommand.register(editor))

    if (!isCloud9() && !isReleaseVersion() && config.betaUrl) {
        ctx.extensionContext.subscriptions.push(watchBetaVSIX(config.betaUrl))
    }
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

async function showGlobalState() {
    const uri = vscode.Uri.parse('aws-dev2:global-state')
    const doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc, { preview: false })
}

export const openStorageCommand = Commands.from(ObjectEditor).declareOpenStorage('_aws.dev.openStorage')

class TaskMemory {
    #epoch = new Date()
    readonly #settings = { showTimestamps: false }
    readonly #tasks = new Map<Task['id'], Task>()
    readonly #timestamps = new Map<Task['id'], { start: number; end?: number }>()
    readonly #onDidChange = new vscode.EventEmitter<void>()
    public readonly onDidChange = this.#onDidChange.event

    public get settings() {
        return this.#settings
    }

    public constructor(service: Tasks) {
        service.onDidAddTask(task => {
            this.#tasks.set(task.id, task)
            this.#timestamps.set(task.id, { start: Date.now() - this.#epoch.getTime() })
            this.#onDidChange.fire()
        })
        service.onDidChangeTaskState(task => {
            this.#tasks.set(task.id, task)
            if (task.state === 'completed' || task.state === 'cancelled') {
                this.#timestamps.set(task.id, {
                    ...this.#timestamps.get(task.id)!,
                    end: Date.now() - this.#epoch.getTime(),
                })
            }
            this.#onDidChange.fire()
        })
    }

    public clear() {
        this.#tasks.clear()
        this.#timestamps.clear()
        this.#epoch = new Date()
        this.#onDidChange.fire()
    }

    public findRootTasks(): Task[] {
        const roots = new Map(this.#tasks.entries())
        const allChildren = Array.from(this.#tasks.values()).map(t => t.info.children)
        for (const children of allChildren) {
            children.forEach(c => roots.delete(c))
        }

        return Array.from(roots.values())
    }

    public getChildren(task: Pick<Task, 'id'>) {
        const children = this.#tasks.get(task.id)?.info.children ?? []

        return children.map(child => this.#tasks.get(child)).filter(isNonNullable)
    }

    public getTimestamps(task: Pick<Task, 'id'>) {
        return this.#timestamps.get(task.id)
    }

    public updateSettings(settings: this['settings']) {
        Object.assign(this.#settings, settings)
        this.#onDidChange.fire()
    }
}

class TaskServiceResource {
    public readonly id = 'tasks'

    public constructor(private readonly memory: TaskMemory) {}

    public getTreeItem() {
        const item = new vscode.TreeItem('Tasks')

        return item
    }

    public listTasks() {
        return sortAndGroupTasks(this.memory.findRootTasks(), this.memory)
    }

    public toTreeNode() {
        return new ResourceTreeNode<this, TaskResource | AggregateTask>(this, {
            placeholder: '[No tasks found]',
            childrenProvider: {
                onDidChange: this.memory.onDidChange,
                listResources: () => this.listTasks().map(task => task.toTreeNode()),
            },
        })
    }
}

const getTaskIcon = (task: Task) => {
    if (isCompleted(task) && !task.result.isOk()) {
        return addColor(getIcon('vscode-error'), 'testing.iconErrored')
    }

    switch (task.state) {
        case 'pending':
            return getIcon('vscode-loading~spin')
        case 'completed':
            return getIcon('vscode-check')
        case 'stopped':
            return getIcon('vscode-ellipsis')
        case 'cancelling':
            return getIcon('vscode-gear~spin')
        case 'cancelled':
            return getIcon('vscode-circle-slash')
    }
}

const cancelTask = Commands.register({ id: '_aws.dev.tasks.cancel', runAsTask: false }, (task: Task) => {
    if (isCancellable(task)) {
        task.cancel()
    }
})

const cancelAllTasks = Commands.register({ id: '_aws.dev.tasks.cancelAll', runAsTask: false }, (tasks: Task[]) => {
    for (const task of tasks) {
        if (isCancellable(task)) {
            task.cancel()
        }
    }
})

function groupAdjacentTasks(tasks: Task[]): Task[][] {
    let group: Task[] | undefined
    const aggregated: Task[][] = []

    for (const task of tasks.sort(sortTasks)) {
        if (
            group === undefined ||
            !(task.state === group[0].state && task.info.name === group[0].info.name && task.info.children.length === 0)
        ) {
            aggregated.push((group = [task]))
        } else {
            group.push(task)
        }
    }

    return aggregated
}

function sortAndGroupTasks(tasks: Task[], memory: TaskMemory) {
    if (memory.settings.showTimestamps) {
        return tasks.map(task => new TaskResource(task, memory))
    }

    return groupAdjacentTasks(tasks).map(group => {
        if (group.length === 1) {
            return new TaskResource(group[0], memory)
        } else {
            return new AggregateTask(group[0].info.name ?? '[anonymous task]', group, memory)
        }
    })
}

function sortTasks(a: Task, b: Task) {
    if (a.state === b.state) {
        if (a.info.name === b.info.name) {
            return a.id - b.id
        }

        return (a.info.name ?? '').localeCompare(b.info.name ?? '')
    }

    const cmp = (o: Task) => {
        switch (o.state) {
            case 'stopped':
                return 0
            case 'pending':
            case 'cancelling':
                return 1
            case 'cancelled':
                return 2
            case 'completed':
                return 3
        }
    }

    return cmp(a) - cmp(b)
}

class TaskResource {
    public readonly id = String(this.task.id)
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event

    public constructor(private readonly task: Task, private readonly memory: TaskMemory) {
        this.memory.onDidChange(() => this.onDidChangeEmitter.fire())
    }

    public listTasks() {
        return sortAndGroupTasks(this.memory.getChildren(this.task), this.memory)
    }

    public getTreeItem() {
        const timestamps = this.memory.getTimestamps(this.task)
        const startTime =
            timestamps?.start && this.memory.settings.showTimestamps ? `T+${timestamps.start / 1000}s` : undefined
        const totalTime =
            timestamps?.start && timestamps?.end && this.memory.settings.showTimestamps
                ? `(${timestamps.end - timestamps.start}ms)`
                : undefined

        const item = new vscode.TreeItem(this.task.info.name ?? this.id)
        item.description = startTime ? `${startTime}${totalTime ? ` ${totalTime}` : ''}` : this.task.state
        item.iconPath = getTaskIcon(this.task)
        item.command = cancelTask.build(this.task).asCommand({ title: '' })
        item.tooltip = [
            this.task.info.type ? `type: ${this.task.info.type}` : undefined,
            this.task.info.metadata ? `metadata: ${JSON.stringify(this.task.info.metadata, undefined, 2)}` : undefined,
        ]
            .filter(isNonNullable)
            .join('\n')

        return item
    }

    public toTreeNode(): ResourceTreeNode<this, TaskResource | AggregateTask> {
        const children = this.listTasks().map(task => task.toTreeNode())

        if (children.length === 0) {
            return new ResourceTreeNode(this)
        }

        return new ResourceTreeNode<this, TaskResource | AggregateTask>(this, {
            childrenProvider: { listResources: () => children },
        })
    }
}

class AggregateTask {
    public readonly id = String(this.tasks.map(task => task.id))
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event

    public constructor(
        private readonly name: string,
        private readonly tasks: Task[],
        private readonly memory: TaskMemory
    ) {
        if (tasks.length === 0) {
            throw new Error('An aggregate task must be initialized with at least one task')
        }
        if (tasks.some(task => task.info.children.length !== 0)) {
            throw new Error('Aggregate tasks should not have any children')
        }
        this.memory.onDidChange(() => this.onDidChangeEmitter.fire())
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.name)
        item.description = `${this.tasks.length} ${this.tasks[0].state}`
        item.iconPath = getTaskIcon(this.tasks[0])
        item.command = cancelAllTasks.build(this.tasks).asCommand({ title: '' })
        item.tooltip = this.tasks[0].info.type ? `type: ${this.tasks[0].info.type}` : undefined

        return item
    }

    public toTreeNode(): ResourceTreeNode<this> {
        return new ResourceTreeNode(this)
    }
}

const clearMemory = Commands.register({ id: '_aws.dev.tasks.clearMemory', runAsTask: false }, (memory: TaskMemory) =>
    memory.clear()
)

const toggleStartTimes = Commands.register(
    { id: '_aws.dev.tasks.toggleStartTimes', runAsTask: false },
    (memory: TaskMemory) =>
        memory.updateSettings({ ...memory.settings, showTimestamps: !memory.settings.showTimestamps })
)

class TasksExplorer implements RootNode {
    #memory?: TaskMemory
    public readonly id = 'tasks-explorer'
    public readonly resource = this
    public readonly onDidChangeChildren = this.memory.onDidChange

    public get memory() {
        return (this.#memory ??= new TaskMemory(this.service))
    }

    public constructor(
        private readonly devSettings = DevSettings.instance,
        private readonly service = Tasks.instance
    ) {}

    public canShow() {
        return this.devSettings.get('showTasksExplorer', false)
    }

    public getTreeItem() {
        const item = new vscode.TreeItem('Tasks Explorer (Toolkit Developer)')
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed

        return item
    }

    public getChildren() {
        const settings = this.memory.settings

        return [
            clearMemory.build(this.memory).asTreeNode({ label: 'Clear Memory', iconPath: getIcon('vscode-trash') }),
            toggleStartTimes.build(this.memory).asTreeNode({
                label: `${settings.showTimestamps ? 'Hide' : 'Show'} Start Times`,
                iconPath: settings.showTimestamps ? getIcon('vscode-eye-closed') : getIcon('vscode-eye'),
            }),
            new TaskServiceResource(this.memory).toTreeNode(),
        ]
    }
}

export function getTasksRootNode(): RootNode {
    return new TasksExplorer()
}
