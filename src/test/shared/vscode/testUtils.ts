/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { toTitleCase } from '../../../shared/utilities/textUtilities'
import { Command, Commands } from '../../../shared/vscode/commands2'

type EventEmitters<T> = {
    [P in keyof T]: T[P] extends vscode.Event<any> ? P : never
}[keyof T]

type InterceptEmitters<T, K extends keyof T> = {
    [P in K as `fire${Capitalize<P & string>}`]: T[P] extends vscode.Event<infer R>
        ? vscode.EventEmitter<R>['fire']
        : never
} & T // prettier really wants to keep this T separate
type FilteredKeys<T> = { [P in keyof T]: T[P] extends never ? never : P }[keyof T]
type NoNever<T> = Pick<T, FilteredKeys<T>>

/**
 * Adds references to event emitters for all known public events as specified by the generic K type.
 * New methods are shown with 'fire' prepended to the capitalized event name.
 */
export type ExposeEmitters<T, K extends EventEmitters<T>> = NoNever<InterceptEmitters<T, K>>

/**
 * Exposes private event emitters of the object. This should exclusively be used for testing purposes since there
 * is no guarantee that the emitters are named 1:1 with their public counterparts. The majority of UI events in
 * VS code are triggered from user interaction, so firing these programmatically should be safe. It is highly
 * recommended to limit the amount of accumulated state when firing these events.
 *
 * @params obj Target object
 * @params keys Events to expose emitters for
 * @returns The extended object with {@link ExposeEmitters exposed methods}
 * @throws Throws an error listing any events that did not have matching emitters
 */
export function exposeEmitters<T extends Record<string, any>, K extends EventEmitters<T>>(
    obj: T,
    keys: K[]
): ExposeEmitters<T, K> {
    Object.entries(obj).forEach(([key, value]) => {
        if (key.startsWith('_onDid') && value instanceof vscode.EventEmitter) {
            const targetEvent = key.slice(1).replace('Emitter', '')
            keys = keys.filter(k => k !== targetEvent)
            Object.assign(obj, { [`fire${toTitleCase(targetEvent)}`]: value.fire.bind(value) })
        }
    })

    if (keys.length > 0) {
        throw new Error(
            `exposeEmitters(): failed to find emitters for keys ${keys.map(k => `"${String(k)}"`).join(', ')}`
        )
    }

    return obj as any
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
