/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { toTitleCase } from '../utilities/textUtilities'
import { isNameMangled } from './env'
import { UnknownError } from '../toolkitError'
import { getLogger, NullLogger } from '../logger/logger'
import { LoginManager } from '../../credentials/loginManager'
import { FunctionKeys, Functions, getFunctions } from '../utilities/classUtils'
import { TreeItemContent, TreeNode } from '../treeview/resourceTreeDataProvider'

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

interface RegisteredCommand<T extends Callback = Callback> extends Command<T> {
    dispose(): void
}

interface DeclaredCommand<T extends Callback = Callback, U extends any[] = any> extends Command<T> {
    register(...dependencies: U): RegisteredCommand<T>
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
        const result = {} as Record<string, (id: string) => DeclaredCommand>

        for (const [k, v] of Object.entries<Callback>(getFunctions(target))) {
            const mappedKey = `declare${toTitleCase(k)}`
            const name = !isNameMangled() ? `${target.name}.${k}` : ''

            result[mappedKey] = id => this.declare({ id, name }, (instance: T) => v.bind(instance))
        }

        return result as Declarables<T>
    }

    public dispose(): void {
        vscode.Disposable.from(...this.resources.values()).dispose()
    }

    private addResource<T extends Callback, U extends any[]>(resource: CommandResource<T, U>): CommandResource<T, U> {
        const registered = this.resources.get(resource.id)

        if (registered?.declared) {
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
    (id: string): DeclaredCommand<F, [target: T]>
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
    private disposed?: boolean
    private subscription?: vscode.Disposable
    private idCounter = 0
    public readonly id = this.resource.info.id

    public constructor(private readonly resource: Deferred<T, U>, private readonly commands = vscode.commands) {}

    public get declared() {
        return !this.disposed
    }

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
        this.disposed = true
        this.subscription?.dispose()
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
            treeItem.command = { command: id, arguments: args, title: content.label }

            return {
                id: `${id}-${(this.idCounter += 1)}`,
                treeItem: Object.assign(treeItem, content),
                resource: this,
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
    readonly errorHandler?: (error: Error) => ReturnType<T> | void
}

async function runCommand<T extends Callback>(fn: T, info: CommandInfo<T>): Promise<ReturnType<T> | undefined> {
    const { args, label, logging } = { logging: true, ...info }
    const logger = logging ? getLogger() : new NullLogger()
    const withArgs = args.length > 0 ? ` with arguments [${args.map(String).join(', ')}]` : ''

    // TODO(sijaden): add telemetry instrumentation here

    logger.debug(`command: running ${label}${withArgs}`)

    try {
        if (info.autoconnect === true) {
            await LoginManager.tryAutoConnect()
        }
        const result = await fn(...args)
        logger.debug(`command: ${label} succeeded`)

        return result
    } catch (error) {
        // We should refrain from calling into extension-specific code directly from this module to avoid
        // dependency issues. A "global" error handler may be added at a later date.
        if (info.errorHandler) {
            return info.errorHandler(UnknownError.cast(error)) ?? undefined
        } else {
            logger.error(`command: ${label} failed: %O`, error)
            throw error
        }
    }
}
