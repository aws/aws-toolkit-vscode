/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { toTitleCase } from '../utilities/textUtilities'
import { isNameMangled } from './env'
import { getLogger, NullLogger } from '../logger/logger'
import { FunctionKeys, Functions, getFunctions } from '../utilities/classUtils'
import { TreeItemContent, TreeNode } from '../treeview/resourceTreeDataProvider'
import { telemetry, MetricName, VscodeExecuteCommand, Metric } from '../telemetry/telemetry'
import globals from '../extensionGlobals'

type Callback = (...args: any[]) => any
type CommandFactory<T extends Callback, U extends any[]> = (...parameters: U) => T

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
interface RegisteredCommand<T extends Callback = Callback> extends Command<T> {
    dispose(): void
}

/**
 * Represents a command that has been declared but not yet registered with
 * VS Code
 *
 * This is a "lazy" command that is only registered when it is actually used.
 */
interface DeclaredCommand<T extends Callback = Callback, U extends any[] = any[]> extends Command<T> {
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
export function registerCommandsWithVSCode<T>(
    extContext: vscode.ExtensionContext,
    declarations: CommandDeclarations<T>,
    backend: T
): void {
    extContext.subscriptions.push(
        ...Object.values<DeclaredCommand>(declarations.declared).map(c => c.register(backend))
    )
}

/**
 * Minimal wrapper around VS Code's `commands` API to give structure around commands registered
 * and consumed by the extension.
 */
export class Commands {
    private readonly resources: Map<string, CommandResource<() => unknown, any>> = new Map()

    public constructor(private readonly commands = vscode.commands) {}

    /**
     * Returns a {@link Command} if the ID is currently registered within VS Code.
     */
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

    /**
     * Registers a new command with the VS Code API.
     *
     * @param info command id (string) or {@link CommandInfo} object
     * @param callback command implementation
     */
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

    /**
     * Declares the _intent_ to register a command.
     *
     * Forward declaration adds one level of indirection. This allows for explicit annotation of
     * not just the command signature but also its immediate dependencies.
     */
    public declare<T extends Callback, D extends any[]>(
        id: string | Omit<CommandInfo<T>, 'args' | 'label'>,
        factory: CommandFactory<T, D>
    ): DeclaredCommand<T, D> {
        const resource = typeof id === 'string' ? { info: { id }, factory } : { info: { ...id }, factory }

        return this.addResource(new CommandResource(resource, this.commands))
    }

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
    public from<T>(target: new (...args: any[]) => T): Declarables<T> {
        type Id = Parameters<Declare<T, Callback>>[0]
        const result = {} as Record<string, Declare<T, Callback>>

        for (const [k, v] of Object.entries<Callback>(getFunctions(target))) {
            const mappedKey = `declare${toTitleCase(k)}`
            const name = !isNameMangled() ? `${target.name}.${k}` : undefined
            const mapInfo = (id: Id) => (typeof id === 'string' ? { id, name } : { name, ...id })

            result[mappedKey] = id => this.declare(mapInfo(id), (instance: T) => v.bind(instance))
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

    /**
     * The default instance of {@link Commands}.
     */
    public static readonly instance = new Commands()

    /**
     * Returns {@link Commands.get} using the default instance.
     */
    public static readonly get = this.instance.get.bind(this.instance)

    /**
     * Returns {@link Commands.register} using the default instance.
     */
    public static readonly register = this.instance.register.bind(this.instance)

    /**
     * Returns {@link Commands.declare} using the default instance.
     */
    public static readonly declare = this.instance.declare.bind(this.instance)

    /**
     * Returns {@link Commands.from} using the default instance.
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

    public constructor(private readonly resource: Deferred<T, U>, private readonly commands = vscode.commands) {}

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
}

function getInstrumenter(id: { id: string; args: any[] }, threshold: number, telemetryName?: MetricName) {
    const currentTime = globals.clock.Date.now()
    const info = TelemetryDebounceInfo.instance.get(id)

    // to reduce # of events actually emitted, we throttle the same* event for brief period of time
    // and instead increment a counter for executions while throttled.
    if (!telemetryName && info?.startTime !== undefined && currentTime - info.startTime < threshold) {
        info.debounceCount += 1
        TelemetryDebounceInfo.instance.set(id, info)
        getLogger().debug(`commands: skipped telemetry for "${id.id}"`)

        return undefined
    }

    // Throttling occurs regardless of whether or not the instrumenter is invoked
    const span = telemetryName ? telemetry[telemetryName] : telemetry.vscode_executeCommand
    const debounceCount = info?.debounceCount !== 0 ? info?.debounceCount : undefined
    TelemetryDebounceInfo.instance.set(id, { startTime: currentTime, debounceCount: 0 })

    return <T extends Callback>(fn: T, ...args: Parameters<T>) =>
        span.run(span => {
            ;(span as Metric<VscodeExecuteCommand>).record({
                command: id.id,
                debounceCount,
                source: BaseCommandSource.findSource(args),
            })

            return fn(...args)
        })
}

/**
 * Adding an instance of this to the execution args of your {@link RegisteredCommand}
 * will set the "source" attribute in the automatically emitted `vscode_executeCommand` metric.
 */
export class BaseCommandSource {
    constructor(readonly source: string) {}

    /**
     * Returns the `source` of a {@link BaseCommandSource} if found
     * in the given args.
     */
    static findSource(args: any[]): string | undefined {
        const source = args.find(arg => arg instanceof BaseCommandSource)
        return source ? source.source : undefined
    }

    toString() {
        return `{ source: "${this.source}" }`
    }
}

/**
 * A way to use less characters to create a {@link BaseCommandSource} instance
 */
export function source(source: string) {
    return new BaseCommandSource(source)
}

/**
 * Sets the "source" attribute for the metric `vscode_executeCommand`.
 *
 * - This must be run in the callback of a {@link RegisteredCommand}.
 */
export function setTelemetrySource(source: BaseCommandSource) {
    /**
     * HACK: In the current implementation, we already record
     * the "source" attribute in {@link getInstrumenter}() before
     * running the callback of a {@link RegisteredCommand} by
     * checking the callback args for a {@link BaseCommandSource}.
     * So this whole function is redundant.
     *
     * But the reason this is done is because it is not obvious
     * to contributors that simply having a {@link BaseCommandSource}
     * in the callback args is enough to set the "source" attribute.
     * So anyone reading the code will not be confused.
     */
    if (!(source instanceof BaseCommandSource)) {
        // case where vscode commands can be executed without the expected args
        return
    }
    telemetry.vscode_executeCommand.record({ source: source.source })
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

    set(key: { id: string; args: any[] }, value: { startTime: number; debounceCount: number }) {
        const actualKey = this.createKey(key.id, key.args)
        this.telemetryInfo.set(actualKey, value)
    }

    get(key: { id: string; args: any[] }) {
        const actualKey = this.createKey(key.id, key.args)
        return this.telemetryInfo.get(actualKey)
    }

    /**
     * The key impacts if an event will be throttled since
     * it is used to resolve a value which determines if throttling
     * is necessary for the given event.
     *
     * Implementation details:
     * The current implementation uses a {@link BaseCommandSource}
     * to differentiate between command events with the same `id`.
     * If the {@link BaseCommandSource} is not found, only the `id`
     * is used and there wont be differentiation between `id`s.
     */
    private createKey(id: string, args: any[]) {
        const commandSource = BaseCommandSource.findSource(args)
        return commandSource ? `${id}-${commandSource}` : id
    }
}

export const defaultTelemetryThrottleMs = 300_000 // 5 minutes

async function runCommand<T extends Callback>(fn: T, info: CommandInfo<T>): Promise<ReturnType<T> | void> {
    const { id, args, label, logging } = { logging: true, ...info }
    const logger = logging ? getLogger() : new NullLogger()
    const withArgs = args.length > 0 ? ` with arguments [${args.map(String).join(', ')}]` : ''
    const threshold = info.telemetryThrottleMs ?? defaultTelemetryThrottleMs
    const instrumenter = logging ? getInstrumenter({ id, args }, threshold || 0, info.telemetryName) : undefined

    logger.debug(`command: running ${label}${withArgs}`)

    try {
        if (info.autoconnect === true) {
            await vscode.commands.executeCommand('_aws.auth.autoConnect')
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
export function registerErrorHandler(handler: typeof errorHandler): void {
    if (errorHandler !== undefined) {
        throw new TypeError('Error handler has already been registered')
    }

    errorHandler = handler
}
