/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { toTitleCase } from '../utilities/textUtilities'
import { getLogger, NullLogger } from '../logger/logger'
import { FunctionKeys, Functions, getFunctions } from '../utilities/classUtils'
import { TreeItemContent, TreeNode } from '../treeview/resourceTreeDataProvider'
import { telemetry, MetricName, VscodeExecuteCommand, Metric, Span } from '../telemetry/telemetry'
import globals from '../extensionGlobals'
import { ToolkitError } from '../errors'
import crypto from 'crypto'
import { keysAsInt } from '../utilities/tsUtils'
import { partialClone } from '../utilities/collectionUtils'
import { isAmazonQ } from '../extensionUtilities'
import { isNameMangled } from '../utilities/typeConstructors'

type Callback = (...args: any[]) => any
type CommandFactory<T extends Callback, U extends any[]> = (...parameters: U) => T

/**
 * HACK
 *
 * If a command matches the following conditions:
 * - Is registered with VS Code
 * - Has args for the execution of the command
 * - Can be executed through a package.json contribution (eg: ellipsis menu in View)
 *
 * Then unexpected args will be passed to the command.
 * - Currently it sets arg[0] to an object or undefined, depending on the context.
 * - And the rest of the args will be undefined do not exist.
 * ---
 * **So as a workaround**, commands who meet the above criteria should
 * - have this type as their first arg as a placeholder
 * - When executing the command from within the code, pass in {@link placeholder} as the first arg.
 * - In the command check if the first arg !== {@link placeholder}, and if so you will need to
 *   set values for the other args since they will not exist.
 */
export type VsCodeCommandArg = typeof placeholder
/** A placeholder value for Commands that use {@link VsCodeCommandArg} */
export const placeholder = 'placeholder**' as const

/**
 * The command was executed by a VSCode UI component which we
 * cannot accurately determine a source.
 */
export const vscodeComponent = 'vscodeComponent'

/**
 * A handle for a generic "command" that is registered (or will be registered) through
 * VS Code's `commands` API.
 *
 * Not to be confused with the {@link vscode.Command UI representation} of a command.
 */
export interface Command<T extends Callback = Callback> {
    /**
     * Unique identifier associated with the command, e.g. `aws.viewLogs`.
     */
    readonly id: string

    /**
     * Entry-point to derive objects that directly or indirectly use the command.
     *
     * This includes many UI-related components such as tree nodes or code lenses.
     */
    build(...args: Parameters<T>): Builder

    /**
     * Executes the command.
     *
     * Only commands registered via {@link Commands} have certain guarantees such as
     * logging and error-handling.
     */
    execute(...parameters: Parameters<T>): Promise<ReturnType<T> | undefined>
}

/**
 * Represents a command that has been registered with VS Code, meaning
 * it can be executed with the `executeCommand` API.
 */
export interface RegisteredCommand<T extends Callback = Callback> extends Command<T> {
    dispose(): void
}

/**
 * Represents a command that has been declared but not yet registered with
 * VS Code
 *
 * This is a "lazy" command that is only registered when it is actually used.
 */
export interface DeclaredCommand<T extends Callback = Callback, U extends any[] = any[]> extends Command<T> {
    register(...dependencies: U): RegisteredCommand<T>
}

/**
 * Classes that have "declared" commands which wrap the underlying
 * logic provided by 'T'.
 *
 * These declared commands can then be used to do things like register
 * it as a VS Code command, or to build a tree node that uses the command.
 *
 * @param T The class that declares the commands
 */
export interface CommandDeclarations<T> {
    readonly declared: { [K in FunctionKeys<T>]: DeclaredCommand<Functions<T>[K], [T]> }
}

/**
 * Using the given inputs will register the given commands with VS Code.
 *
 * @param declarations Has the mapping of command names to the backend logic
 * @param backend The backend logic of the commands
 */
export function registerDeclaredCommands<T>(
    disposables: { dispose(): any }[],
    declarations: CommandDeclarations<T>,
    backend: T
): void {
    disposables.push(...Object.values<DeclaredCommand>(declarations.declared).map((c) => c.register(backend)))
}

/**
 * Minimal wrapper around VS Code's `commands` API to give structure around commands registered
 * and consumed by the extension.
 */
export class Commands {
    private readonly resources: Map<string, CommandResource<() => unknown, any>> = new Map()

    public constructor(private readonly commands = vscode.commands) {}

    /** See {@link Commands.get}. */
    public async get(id: string): Promise<Command | undefined> {
        const registeredCommands = await this.commands.getCommands()

        if (registeredCommands.includes(id)) {
            const throwOnRegister = () => {
                throw new Error(`Command "${id}" cannot be re-registered`)
            }

            const info = { id }
            return new CommandResource<Callback>({ info, factory: throwOnRegister }, this.commands)
        }
    }

    /** See {@link Commands.getOrThrow}. */
    public async getOrThrow(id: string): Promise<Command> {
        const cmd = await this.get(id)
        if (cmd === undefined) {
            throw new ToolkitError(`Tried to get Command '${id}', but it hasn't been registered.`)
        }

        return cmd
    }

    /** See {@link Commands.tryExecute}. */
    public async tryExecute<T extends Callback = Callback>(
        id: string,
        ...args: Parameters<T>
    ): Promise<ReturnType<T> | undefined> {
        const cmd = this.resources.get(id)
        if (!cmd) {
            getLogger().debug('command not found: "%s"', id)
            return undefined
        }
        return this.commands.executeCommand<ReturnType<T>>(id, ...args)?.then(undefined, (e: Error) => {
            getLogger().warn('command failed (not registered?): "%s"', id)
            return undefined
        })
    }

    /** See {@link Commands.register}. */
    public register<T extends Callback>(
        info: string | Omit<CommandInfo<T>, 'args' | 'label'>,
        callback: T
    ): RegisteredCommand<T> {
        const resource = new CommandResource(
            {
                info: typeof info === 'string' ? { id: info } : info,
                factory: () => callback,
            },
            this.commands
        )

        return this.addResource(resource).register()
    }

    /** See {@link Commands.declare}. */
    public declare<T extends Callback, D extends any[]>(
        id: string | Omit<CommandInfo<T>, 'args' | 'label'>,
        factory: CommandFactory<T, D>
    ): DeclaredCommand<T, D> {
        const resource = typeof id === 'string' ? { info: { id }, factory } : { info: { ...id }, factory }

        return this.addResource(new CommandResource(resource, this.commands))
    }

    /** See {@link Commands.from}. */
    public from<T>(target: new (...args: any[]) => T): Declarables<T> {
        type Id = Parameters<Declare<T, Callback>>[0]
        const result = {} as Record<string, Declare<T, Callback>>

        for (const [k, v] of Object.entries<Callback>(getFunctions(target))) {
            const mappedKey = `declare${toTitleCase(k)}`
            const name = !isNameMangled() ? `${target.name}.${k}` : undefined
            const mapInfo = (id: Id) => (typeof id === 'string' ? { id, name } : { name, ...id })

            result[mappedKey] = (id) => this.declare(mapInfo(id), (instance: T) => v.bind(instance))
        }

        return result as unknown as Declarables<T>
    }

    public dispose(): void {
        vscode.Disposable.from(...this.resources.values()).dispose()
    }

    private addResource<T extends Callback, U extends any[]>(resource: CommandResource<T, U>): CommandResource<T, U> {
        const previous = this.resources.get(resource.id)

        if (previous !== undefined) {
            throw new Error(`Command "${resource.id}" has already been declared by the Toolkit`)
        }

        this.resources.set(resource.id, resource)
        return resource
    }

    /** Default instance of {@link Commands}. */
    public static readonly instance = new Commands()

    /**
     * Returns a {@link Command} if the ID is currently registered within VS Code,
     * or undefined otherwise.
     */
    public static readonly get = this.instance.get.bind(this.instance)

    /**
     * Returns a {@link Command} if the ID is currently registered within VS Code,
     * or throws a {@link ToolkitError} otherwise.
     */
    public static readonly getOrThrow = this.instance.getOrThrow.bind(this.instance)

    /**
     * Executes a command if it exists, else does nothing.
     */
    public static readonly tryExecute = this.instance.tryExecute.bind(this.instance)

    /**
     * Registers a new command with the VS Code API.
     *
     * @param info command id (string) or {@link CommandInfo} object
     * @param callback command implementation
     */
    public static readonly register = this.instance.register.bind(this.instance)

    /**
     * Declares the _intent_ to register a command.
     *
     * Forward declaration adds one level of indirection. This allows for explicit annotation of
     * not just the command signature but also its immediate dependencies.
     */
    public static readonly declare = this.instance.declare.bind(this.instance)

    /**
     * Convenience method to declare commands directly from a class.
     *
     * Mostly used when many commands are associated with the same long-lived context.
     * Functions are currently bound at declaration time for simplicity, though this
     * may change in the future.
     *
     * #### Example
     * ```ts
     * class Foo {
     *     public square(n: number): number {
     *         return n * n
     *     }
     * }
     *
     * const square = Commands.instance.from(Foo).declareSquare('aws.square')
     * await square.register(new Foo()).execute(5)
     * ```
     */
    public static readonly from = this.instance.from.bind(this.instance)
}

interface Declare<T, F extends Callback> {
    (id: string | Omit<CommandInfo<F>, 'args' | 'label'>): DeclaredCommand<F, [target: T]>
}

type Declarables<T> = {
    [P in FunctionKeys<T> as `declare${Capitalize<P & string>}`]: Declare<T, Functions<T>[P]>
}

type PartialCommand = Omit<vscode.Command, 'arguments' | 'command'>
type PartialTreeItem = Omit<TreeItemContent, 'command'>

interface Builder {
    asUri(): vscode.Uri
    asCommand(content: PartialCommand): vscode.Command
    asTreeNode(content: PartialTreeItem): TreeNode<Command>
    asCodeLens(range: vscode.Range, content: PartialCommand): vscode.CodeLens
}

interface Deferred<T extends Callback, U extends any[]> {
    readonly info: Omit<CommandInfo<T>, 'args' | 'label'>
    readonly factory: CommandFactory<T, U>
}

/**
 * Contains the command implementation and properties.
 *
 * `CommandResources` are registered on the {@link Commands} singleton. This class does not
 * differentiate between 'registered' and 'declared' commands; that abstraction is handled
 * by the singleton.
 */
class CommandResource<T extends Callback = Callback, U extends any[] = any[]> {
    private subscription: vscode.Disposable | undefined
    private idCounter = 0
    public readonly id = this.resource.info.id

    public constructor(
        private readonly resource: Deferred<T, U>,
        private readonly commands = vscode.commands
    ) {}

    public get registered() {
        return !!this.subscription
    }

    public build(...args: Parameters<T>): Builder {
        const id = this.resource.info.id

        return {
            asUri: this.buildUri(id, args),
            asCommand: this.buildCommand(id, args),
            asCodeLens: this.buildCodeLens(id, args),
            asTreeNode: this.buildTreeNode(id, args),
        }
    }

    public register(...args: U): RegisteredCommand<T> {
        const { id, name } = this.resource.info
        const label = name ? `"${name}" (id: ${id})` : `"${id}"`
        const target = this.resource.factory(...args)
        const instrumented = (...args: Parameters<T>) => {
            const info: CommandInfo<T> = {
                ...this.resource.info,
                id: id,
                label: label,
                args: args,
            }
            return runCommand(target, info)
        }
        this.subscription = this.commands.registerCommand(this.resource.info.id, instrumented)

        return this
    }

    public async execute(...args: Parameters<T>): Promise<ReturnType<T> | undefined> {
        return this.commands.executeCommand<ReturnType<T>>(this.resource.info.id, ...args)
    }

    public dispose(): void {
        this.subscription?.dispose()
        this.subscription = undefined
    }

    private buildUri(id: string, args: unknown[]) {
        return () => vscode.Uri.parse(`command:${id}?${encodeURIComponent(JSON.stringify(args))}`)
    }

    private buildCommand(id: string, args: unknown[]) {
        return (content: PartialCommand) => ({ ...content, command: id, arguments: args })
    }

    private buildCodeLens(id: string, args: unknown[]) {
        return (range: vscode.Range, content: PartialCommand) => {
            return new vscode.CodeLens(range, this.buildCommand(id, args)(content))
        }
    }

    private buildTreeNode(id: string, args: unknown[]) {
        return (content: PartialTreeItem) => {
            const treeItem = new vscode.TreeItem(content.label, vscode.TreeItemCollapsibleState.None)
            Object.assign(treeItem, {
                ...content,
                command: { command: id, arguments: args, title: content.label },
            })

            return {
                id: `${id}-${(this.idCounter += 1)}`,
                resource: this,
                getTreeItem: () => treeItem,
            }
        }
    }
}

interface CommandInfo<T extends Callback> {
    readonly id: string
    readonly name?: string
    /** Display label, generated from id + name. */
    readonly label?: string
    readonly args: Parameters<T>
    readonly logging?: boolean
    /** Does the command require credentials? (default: false) */
    readonly autoconnect?: boolean

    /**
     * The telemetry event associated with this command.
     *
     * Attributes can be added during execution like so:
     * ```ts
     * telemetry.record({ exampleMetadata: 'bar' })
     * ```
     *
     * Attributes are sent with the event on completion.
     */
    readonly telemetryName?: MetricName

    /**
     * Prevents telemetry from being emitted more than once
     * within N milliseconds. Setting this to false disables
     * throttling, emitting an event for every call.
     *
     * (default: 5 minutes)
     */
    readonly telemetryThrottleMs?: number | false

    /**
     * The indexes of args in `execute()` that will be used to determine
     * the uniqueness of the metric `vscode_executeCommand`.
     *
     * - By default, {@link VscodeExecuteCommand} is throttled for metrics of the
     *   same {@link VscodeExecuteCommand.command}.
     * - By defining this property, the values of the args will be combined
     *   with the {@link VscodeExecuteCommand.command}.
     *   This ensures throttling only happens for the same {@link VscodeExecuteCommand.command} + args
     *   instead.
     * - Indexes starts at 0.
     *
     * @example
     * const compositeKey: CompositeKey = {
     *     1: 'source' // the value is the "source" field of `vscode_executeCommand`
     * }
     * ...
     * myCommand.execute(undefined, 'SourceValue')
     * ...
     * // vscode_executeCommand -> { command: 'myCommand' source: 'SourceValue' }
     */
    readonly compositeKey?: CompositeKey
}

/**
 * Indicates that the arg should be used as a telemetry field
 * for the metric {@link VscodeExecuteCommand}.
 */
export type CompositeKey = { [index: number]: MetricField }

/** Supported {@link VscodeExecuteCommand} fields */
const MetricFields = {
    /**
     * TODO: Figure out how to derive "source" as a type from {@link VscodeExecuteCommand.source}
     * instead of explicitly writing it.
     */
    source: 'source',
} as const
type MetricField = (typeof MetricFields)[keyof typeof MetricFields]

function getInstrumenter(
    id: { id: string; args: any[]; compositeKey: CompositeKey },
    threshold: number,
    telemetryName?: MetricName
) {
    handleBadCompositeKey(id)
    const currentTime = globals.clock.Date.now()
    const info = TelemetryDebounceInfo.instance.get(id)

    // to reduce # of events actually emitted, we throttle the same* event for brief period of time
    // and instead increment a counter for executions while throttled.
    if (!telemetryName && info?.startTime !== undefined && currentTime - info.startTime < threshold) {
        info.debounceCount += 1
        TelemetryDebounceInfo.instance.set(id, info)
        getLogger().debug('telemetry: collapsing %d "%s" metrics. key=%O', info.debounceCount, id.id, id.compositeKey)

        return undefined
    }

    // Throttling occurs regardless of whether or not the instrumenter is invoked
    const span: Metric = telemetryName ? telemetry[telemetryName] : telemetry.vscode_executeCommand
    const debounceCount = info?.debounceCount !== 0 ? info?.debounceCount : undefined
    TelemetryDebounceInfo.instance.set(id, { startTime: currentTime, debounceCount: 0 })

    const fields = findFieldsToAddToMetric(id.args, id.compositeKey)

    return <T extends Callback>(fn: T, ...args: Parameters<T>) =>
        span.run(
            (span) => {
                ;(span as Span<VscodeExecuteCommand>).record({
                    command: id.id,
                    debounceCount,
                    ...fields,
                })

                return fn(...args)
            },
            // wrap all command executions with their ID as context for telemetry.
            // this will give us a better idea on the entrypoints of executions
            { functionId: { name: id.id, class: 'Commands' } }
        )
}

export const unsetSource = 'sourceImproperlySet'

function handleBadCompositeKey(data: { id: string; args: any[]; compositeKey: CompositeKey }) {
    const id = data.id
    const args = data.args
    const compositeKey = data.compositeKey

    if (Object.keys(compositeKey).length === 0) {
        return // nothing to do since no key
    }

    Object.entries(compositeKey).forEach(([index, field]) => {
        const indexAsInt = parseInt(index)
        const arg = args[indexAsInt]
        if (field === 'source' && arg === undefined) {
            args[indexAsInt] = 'vscodeUI'
        } else if (field === 'source' && typeof arg !== 'string') {
            /**
             * This case happens when either the caller sets the wrong args themselves through
             * vscode.commands.executeCommand OR if through a VS Code UI component like the ellipsis menu
             *
             * TODO: To fix this we insert a value in the `source` arg so that there is something there
             * for the metric to emit. We need to figure out a better way to handle either incorrectly called
             * or the VS Code UI component.
             */
            getLogger().error('Commands/Telemetry: "%s" executed with invalid "source" type: "%O"', id, args)
            args[indexAsInt] = unsetSource
        }
    })
}

/**
 * Returns a map that contains values for the fields of {@link VscodeExecuteCommand}.
 *
 * These fields are resolved by extracting the {@link args} that were specified
 * in {@link compositeKey}.
 */
function findFieldsToAddToMetric(args: any[], compositeKey: CompositeKey): { [field in MetricField]?: any } {
    const indexes = keysAsInt(compositeKey)
    const indexesWithValue = indexes.filter((i) => compositeKey[i] !== undefined)
    const sortedIndexesWithValue = indexesWithValue.sort((a, b) => a - b)

    const result: { [field in MetricField]?: any } = {}
    sortedIndexesWithValue.forEach((i) => {
        const fieldName: MetricField = compositeKey[i]
        const fieldValue = args[i]
        result[fieldName] = fieldValue
    })
    return result
}

/**
 * Storage of telemetry events that is used for the purposes
 * of maintaining the count of throttled event executions.
 *
 * - This ensures a {@link RegisteredCommand} that contains a {@link BaseCommandSource} in their
 *   execution `args` is differentiated in telemetry.
 */
export class TelemetryDebounceInfo {
    private telemetryInfo = new Map<string, { startTime: number; debounceCount: number }>()

    static #instance: TelemetryDebounceInfo
    static get instance() {
        return (this.#instance ??= new TelemetryDebounceInfo())
    }

    /** @warning For testing purposes only */
    protected constructor() {}

    set(
        key: { id: string; args: any[]; compositeKey: CompositeKey },
        value: { startTime: number; debounceCount: number }
    ) {
        const actualKey = this.createKey(key)
        this.telemetryInfo.set(actualKey, value)
    }

    get(key: { id: string; args: any[]; compositeKey: CompositeKey }) {
        const actualKey = this.createKey(key)
        return this.telemetryInfo.get(actualKey)
    }

    clear() {
        this.telemetryInfo = new Map<string, { startTime: number; debounceCount: number }>()
    }

    /**
     * The map key impacts if an event will be throttled since
     * it is used to lookup a value in {@link telemetryInfo} which determines if throttling
     * is necessary for the given event.
     *
     * Implementation details:
     * The current implementation extracts the indexes from `args` using
     * the indexes specificed by the {@link IndexedArg} objects.
     */
    private createKey(key: { id: string; args: any[]; compositeKey: CompositeKey }) {
        const id = key.id
        const args = key.args
        const uniqueIndexes: number[] = keysAsInt(key.compositeKey).sort((a, b) => a - b)

        if (uniqueIndexes[uniqueIndexes.length - 1] > args.length - 1) {
            throw new ToolkitError(`Unique arg indexes exceed the # of args for: "${id}"`)
        }

        // All the args that will be used to build the unique key
        const uniqueArgs = uniqueIndexes.map((i) => args[i])

        return uniqueArgs.length > 0 ? `${id}-${this.hashObjects(uniqueArgs)}` : id
    }

    /**
     * This creates a hash from the args which is used
     * in the key for {@link telemetryInfo}.
     */
    private hashObjects(objects: any[]): string {
        const hashableObjects = objects.map((obj) => {
            if (typeof obj === 'string') {
                return obj
            }
            if (typeof obj === 'boolean') {
                return obj.toString()
            }
            // Add more implementations here as needed
            throw new ToolkitError(`Cannot create unique key for type: "${typeof obj}"`)
        })

        const hasher = crypto.createHash('sha256')
        hashableObjects.forEach((o) => hasher.update(o))
        return hasher.digest('hex')
    }
}

export const defaultTelemetryThrottleMs = 300_000 // 5 minutes

async function runCommand<T extends Callback>(fn: T, info: CommandInfo<T>): Promise<ReturnType<T> | void> {
    const { id, args, label, logging, compositeKey } = { logging: true, ...info }
    const logger = logging ? getLogger() : new NullLogger()
    const threshold = info.telemetryThrottleMs ?? defaultTelemetryThrottleMs
    const instrumenter = logging
        ? getInstrumenter({ id, args, compositeKey: compositeKey ?? {} }, threshold || 0, info.telemetryName)
        : undefined

    logger.debug(
        `command: running ${label} with arguments: %O`,
        partialClone(args, 3, ['clientSecret', 'accessToken', 'refreshToken', 'tooltip'], '[omitted]')
    )

    try {
        if (info.autoconnect === true) {
            const prefix = isAmazonQ() ? 'amazonq' : 'toolkit'
            await vscode.commands.executeCommand(`_aws.${prefix}.auth.autoConnect`)
        }

        return await (instrumenter ? instrumenter(fn, ...args) : fn(...args))
    } catch (error) {
        if (errorHandler !== undefined) {
            errorHandler(info, error)
        } else {
            logger.error(`command: ${label} failed without error handler: %s`, error)
            throw error
        }
    }
}

// Error handling may involve other Toolkit modules and so it must be defined and registered at
// the extension entry-point. `Commands` form the backbone of everything else in the Toolkit.
// This file should contain as little application-specific logic as possible.
let errorHandler: (info: Omit<CommandInfo<any>, 'args'>, error: unknown) => void
export function registerCommandErrorHandler(handler: typeof errorHandler): void {
    if (errorHandler !== undefined) {
        throw new TypeError('Error handler has already been registered')
    }

    errorHandler = handler
}
