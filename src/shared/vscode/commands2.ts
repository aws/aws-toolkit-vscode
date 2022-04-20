/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { randomUUID } from 'crypto' // TODO(sijaden): find browser compatible module
import { capitalize } from '../utilities/textUtilities'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { isNameMangled } from './env'
import { UnknownError } from '../toolkitError'
import { getLogger, NullLogger } from '../logger/logger'

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
    readonly build: CommandBuilder<T>

    /**
     * Executes the command.
     *
     * Only commands registered via {@link Commands} have certain guarantees such as
     * logging and error-handling.
     */
    readonly execute: (...parameters: Parameters<T>) => Promise<ReturnType<T> | undefined>
}

interface RegisteredCommand<T extends Callback = Callback> extends Command<T> {
    readonly dispose: () => void
}

interface DeclaredCommand<T extends Callback = Callback, U extends any[] = any> extends Command<T> {
    readonly register: (...dependencies: U) => RegisteredCommand<T>
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

            return new CommandResource<Callback>({ id, factory: throwOnRegister }, this.commands)
        }
    }

    /**
     * Registers a new command with the VS Code API.
     */
    public register<T extends Callback>(id: string, callback: T): RegisteredCommand<T> {
        const resource = new CommandResource({ id, factory: () => callback }, this.commands)

        return this.addResource(resource).register()
    }

    /**
     * Declares the _intent_ to register a command.
     *
     * Forward declaration adds one level of mis-direction. This allows for explicit annotation of
     * not just the command signature but also its immediate dependencies.
     */
    public declare<T extends Callback, D extends any[]>(
        id: string | { id: string; name: string },
        factory: CommandFactory<T, D>
    ): DeclaredCommand<T, D> {
        const resource = typeof id === 'string' ? { id, factory } : { ...id, factory }

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
            const mappedKey = `declare${capitalize(k)}`
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

    static #instance: Commands

    public static get instance(): Commands {
        return (this.#instance ??= new Commands())
    }
}

type Functions<T> = { [P in keyof T]: T[P] extends Callback ? T[P] : never }
type FunctionKeys<T> = { [P in keyof T]: T[P] extends Callback ? P : never }[keyof T]

interface Declare<T, F extends Callback> {
    (id: string): DeclaredCommand<F, [target: T]>
}

type Declarables<T> = {
    [P in FunctionKeys<T> as `declare${Capitalize<P & string>}`]: Declare<T, Functions<T>[P]>
}

/**
 * Returns all functions found on the target's prototype chain.
 *
 * Conflicts from functions sharing the same key are resolved by order of appearance, earlier
 * functions given precedence. This is equivalent to how the prototype chain is traversed when
 * evaluating `target[key]`, so long as the property descriptor is not a 'getter' function.
 */
function getFunctions<T>(target: new (...args: any[]) => T): Functions<T> {
    const result = {} as Functions<T>

    for (const k of Object.getOwnPropertyNames(target.prototype)) {
        if (typeof target.prototype[k] === 'function') {
            result[k as keyof T] = target.prototype[k]
        }
    }

    const next = Object.getPrototypeOf(target)
    return next && next.prototype ? { ...getFunctions(next), ...result } : result
}

// TODO(sijaden): implement decoupled tree-view, then move this
type ExcludedKeys = 'id' | 'label' | 'collapsibleState'
interface LabeledTreeItem extends Omit<vscode.TreeItem, ExcludedKeys> {
    readonly label: string
}

type PartialCommand = Omit<vscode.Command, 'arguments' | 'command'>
type PartialTreeItem = Omit<LabeledTreeItem, 'command'>

interface Builder {
    asUri(): vscode.Uri
    asCommand(content: PartialCommand): vscode.Command
    asTreeNode(content: PartialTreeItem): AWSTreeNodeBase
    asCodeLens(range: vscode.Range, content: PartialCommand): vscode.CodeLens
}

type CommandBuilder<T extends Callback> = (...args: Parameters<T>) => Builder
interface Deferred<T extends Callback, U extends any[]> {
    readonly id: string
    readonly name?: string
    readonly factory: CommandFactory<T, U>
}

class CommandResource<T extends Callback = Callback, U extends any[] = any[]> {
    private disposed?: boolean
    private subscription?: vscode.Disposable
    public readonly id = this.resource.id

    public constructor(private readonly resource: Deferred<T, U>, private readonly commands = vscode.commands) {}

    public get declared() {
        return !this.disposed
    }

    public get registered() {
        return !!this.subscription
    }

    public build(...args: Parameters<T>): Builder {
        const id = this.resource.id

        return {
            asUri: this.buildUri(id, args),
            asCommand: this.buildCommand(id, args),
            asCodeLens: this.buildCodeLens(id, args),
            asTreeNode: this.buildTreeNode(id, args),
        }
    }

    public register(...args: U): RegisteredCommand<T> {
        const { id, name } = this.resource
        const label = name ? `"${name}" (id: ${id})` : `"${id}"`
        const target = this.resource.factory(...args)
        const instrumented = (...args: Parameters<T>) => runCommand(target, { label, args })
        this.subscription = this.commands.registerCommand(this.resource.id, instrumented)

        return this
    }

    public async execute(...args: Parameters<T>): Promise<ReturnType<T> | undefined> {
        return this.commands.executeCommand<ReturnType<T>>(this.resource.id, ...args)
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
            return new (class extends AWSTreeNodeBase {
                public constructor() {
                    super(content.label, vscode.TreeItemCollapsibleState.None)
                    this.id = `${id}-${randomUUID()}`
                    this.command = { command: id, arguments: args, title: content.label }

                    Object.assign(this, content)
                }
            })()
        }
    }
}

interface CommandInfo<T extends Callback> {
    readonly label: string
    readonly args: Parameters<T>
    readonly logging?: boolean
    readonly errorHandler?: (error: Error) => ReturnType<T> | void
}

async function runCommand<T extends Callback>(fn: T, info: CommandInfo<T>): Promise<ReturnType<T> | undefined> {
    const { args, label, logging } = { logging: true, ...info }
    const logger = logging ? getLogger() : new NullLogger()
    const withArgs = args.length > 0 ? ` with arguments [${args.map(String).join(', ')}]` : ''
    logger.debug(`command: running ${label}${withArgs}`)

    try {
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
