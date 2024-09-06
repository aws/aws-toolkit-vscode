/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Command, Commands } from '../../../shared/vscode/commands2'

type Events<T> = {
    [P in keyof T]: T[P] extends vscode.Event<any> ? P & string : never
}[keyof T]
export type EventEmitters<T> = {
    [P in Events<T>]: T[P] extends vscode.Event<infer U> ? vscode.EventEmitter<U> : never
}

/**
 * Creates a copy of the target command, injecting dependencies and registering it with a new id.
 *
 * ### Example
 * ```ts
 * const foo = Commands.declare('aws.foo', (memento: vscode.Memento) => () => memento.get<string>('foo'))
 * const testMemento = new FakeMemento()
 * const testFoo = testCommand(foo, testMemento)
 *
 * // Test commands are always prefixed with 'test.'
 * assert.strictEqual(testFoo.id, 'test.aws.foo')
 *
 * await testMemento.update('foo', 'bar')
 * assert.strictEqual(await testFoo.execute(), 'bar')
 *
 * // Clean-up the command afterwards
 * testFoo.dispose()
 * ```
 */
export function testCommand<T extends (...args: any[]) => unknown, U extends any[]>(
    command: ReturnType<typeof Commands.declare<T, U>>,
    ...args: U
): Command<T> & vscode.Disposable {
    const testCommands = new Commands()
    const testId = `test.${command.id}`
    // `command` refers to the hidden 'CommandResource' class in 'commands2.ts'
    const resource = (command as any).resource as { id: string; factory: (...args: U) => any; info: any }

    return testCommands.register({ ...resource.info, id: testId }, resource.factory(...args))
}
