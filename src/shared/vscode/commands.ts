/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-ignore
import * as vscode from 'vscode'

/**
 * Components associated with {@link module:vscode.commands}.
 */
export interface Commands {
    /**
     * See {@link module:vscode.commands.executeCommand}.
     */
    execute<T>(command: string, ...rest: any[]): Thenable<T | undefined>
}

export namespace Commands {
    export function vscode(): Commands {
        return new DefaultCommands()
    }
}

class DefaultCommands implements Commands {
    public execute<T>(command: string, ...rest: any[]): Thenable<T | undefined> {
        return vscode.commands.executeCommand(command, ...rest)
    }
}

type Callback = (...args: any[]) => unknown
type CommandParameters = Omit<vscode.Command, 'command' | 'arguments'>
type CommandBind<F extends Callback> = CommandParameters & { arguments: Parameters<F> }
type BoundCommand<C extends Command> = CommandBind<CommandCallback<C>> & { command: C['id'] }
type CommandCallback<T> = T extends Command<any, infer C> ? C : never
type CommandFactory<F extends Callback, D extends any[]> = (...parameters: D) => F
type FromDeclared<C> = C extends DeclaredCommand<infer I, infer F, any> ? Command<I, F> : never

const builder: <T extends string>(id: T) => CommandBuilder =
    id =>
    (arg0, ...rest) => {
        if (typeof arg0 === 'string') {
            return { command: id, title: arg0, arguments: rest }
        }
        return { command: id, ...arg0 }
    }

export interface Command<T extends string = string, F extends Callback = Callback> {
    readonly id: T
    readonly callback: F
}

interface CommandBuilder<T extends string = string, F extends Callback = Callback> {
    (parameters: CommandBind<F>): CommandBind<F> & { command: T }
    (title: string, ...args: Parameters<F>): CommandBind<F> & { command: T }
}

export interface DeclaredCommand<T extends string = string, F extends Callback = Callback, D extends any[] = any> {
    readonly id: T
    build: CommandBuilder<T, F>
    register: (...dependencies: D) => RegisteredCommand<T, F>
}

export interface RegisteredCommand<T extends string = string, F extends Callback = Callback> extends Command<T, F> {
    dispose: () => void
    build: CommandBuilder<T, F>
    execute: (...parameters: Parameters<F>) => ReturnType<F>
}

export function declareCommand<T extends string, F extends Callback, D extends any[]>(
    id: T,
    factory: CommandFactory<F, D>
): DeclaredCommand<T, F, D> {
    const register = (...args: D) => registerCommand(id, factory(...args))
    const build: DeclaredCommand<T, F, D>['build'] = builder(id) as CommandBuilder<T, F>

    return { id, register, build }
}

export function registerCommand<T extends string, F extends Callback>(id: T, callback: F): RegisteredCommand<T, F> {
    const command = { id, callback }
    const subscription = vscode.commands.registerCommand(id, callback)
    const build: RegisteredCommand<T, F>['build'] = builder(id) as CommandBuilder<T, F>
    const execute: RegisteredCommand<T, F>['execute'] = (...args) =>
        vscode.commands.executeCommand(id, ...args) as ReturnType<F>

    return { ...command, build, execute, dispose: () => subscription.dispose() }
}

type BoundCodeLens<C extends DeclaredCommand | RegisteredCommand> = Omit<vscode.CodeLens, 'command' | 'isResolved'> & {
    readonly command: C extends Command ? BoundCommand<C> : BoundCommand<FromDeclared<C>>
    readonly isResolved: true
}

type ReduceTuple<T> = T extends [infer _, ...infer R] ? R : T
export const codeLensFactory =
    <C extends DeclaredCommand | RegisteredCommand>(command: C, params: CommandParameters) =>
    (range: vscode.Range, ...args: ReduceTuple<Parameters<C['build']>>) => {
        return new vscode.CodeLens(range, command.build({ ...params, arguments: args })) as BoundCodeLens<C>
    }

const range = new vscode.Range(0, 0, 0, 0)
const cmd = registerCommand('foo', (bar: number) => bar + 1)
const factory = codeLensFactory(cmd, { title: 'My Lens' })

vscode.languages.registerCodeLensProvider(
    {},
    {
        provideCodeLenses() {
            return [factory(range, 1000)]
        },
    }
)
