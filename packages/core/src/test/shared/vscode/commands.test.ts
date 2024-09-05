/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { Commands } from '../../../shared/vscode/commands2'

describe('Commands', function () {
    let commands: Commands
    let from: Commands['from']

    beforeEach(function () {
        commands = new Commands()
        from = commands.from.bind(commands)
    })

    afterEach(function () {
        commands.dispose()
    })

    describe('get', function () {
        it('returns a command if it exists', async function () {
            const command = await commands.get('vscode.open')
            assert.strictEqual(command?.id, 'vscode.open')
        })

        it('returns `undefined` when the command does not exist', async function () {
            const command = await commands.get('aws.foo')
            assert.strictEqual(command, undefined)
        })
    })

    describe('declare', function () {
        function sum(a: number, b: number) {
            return a + b
        }

        const add = (a: number) => (b: number) => sum(a, b)

        it('uses the provided factory function', async function () {
            const declared = commands.declare('add3', add)
            const registered = declared.register(3)

            assert.strictEqual(await registered.execute(4), 7)
        })

        it('throws when declaring a declared id', function () {
            commands.declare('add', add)
            assert.throws(() => commands.declare('add', add))
        })

        it('throws when declaring a registered id', function () {
            commands.register('add', add(0))
            assert.throws(() => commands.declare('add', add))
        })

        it('can be built while not registered', async function () {
            const declared = commands.declare('add3', add)
            const built = declared.build(7).asCommand({ title: 'Add 3 to 7' })
            const registered = declared.register(3)

            assert.strictEqual(await registered.execute(7), 10)
            assert.deepStrictEqual(built, {
                title: 'Add 3 to 7',
                command: 'add3',
                arguments: [7],
            })
        })
    })

    describe('register', function () {
        function sum(a: number, b: number) {
            return a + b
        }

        it('uses the provided id', async function () {
            const previous = await commands.get('sum')
            commands.register('sum', sum)

            assert.strictEqual(previous, undefined)
            assert.ok(await commands.get('sum'))
        })

        it('can execute a command', async function () {
            const registered = commands.register('sum', sum)
            assert.strictEqual(await registered.execute(2, 2), 4)
        })

        it('throws when registering a command multiple times', function () {
            commands.register('sum', sum)
            assert.throws(() => commands.register('sum', sum))
        })

        describe('Command', function () {
            it('can build a command with a title', function () {
                const registered = commands.register('sum', sum)
                const built = registered.build(1, 2).asCommand({ title: 'Sum' })

                assert.deepStrictEqual(built, {
                    title: 'Sum',
                    command: 'sum',
                    arguments: [1, 2],
                })
            })

            it('can build a command with a tooltip', function () {
                const registered = commands.register('sum', sum)
                const built = registered.build(2, 3).asCommand({ title: '2 + 3', tooltip: 'Add 2 + 3' })

                assert.deepStrictEqual(built, {
                    title: '2 + 3',
                    command: 'sum',
                    tooltip: 'Add 2 + 3',
                    arguments: [2, 3],
                })
            })
        })

        describe('Uri', function () {
            it('can build a command uri', function () {
                const registered = commands.register('sum', sum)
                const built = registered.build(2, 3).asUri()

                assert.strictEqual(built.toString(true), 'command:sum?[2,3]')
            })

            it('encodes arguments appropriately', function () {
                const registered = commands.register('pass', (input: string) => input)
                const built = registered.build('https://github.com/aws/aws-toolkit-vscode').asUri()

                assert.strictEqual(built.toString(true), 'command:pass?["https://github.com/aws/aws-toolkit-vscode"]')
            })
        })

        describe('TreeItem', function () {
            it('can build a tree node', function () {
                const registered = commands.register('sum', sum)
                const built = registered.build(5, 4).asTreeNode({ label: 'Sum' })
                const item = built.getTreeItem()

                assert.ok(item instanceof vscode.TreeItem)
                assert.strictEqual(item.label, 'Sum')
                assert.strictEqual(item.command?.command, 'sum')
                assert.deepStrictEqual(item.command?.arguments, [5, 4])
                assert.strictEqual(built.resource, registered)
            })
        })
    })

    describe('from', function () {
        class Foo {
            public bar(p: number): string {
                return this.s.repeat(p)
            }
            public constructor(protected readonly s: string) {}
        }

        it('can register a declared command', function () {
            const declared = from(Foo).declareBar('my.command')
            declared.register(new Foo('boo'))
        })

        it('can execute a declared command', async function () {
            const declared = from(Foo).declareBar('my.command')
            const registered = declared.register(new Foo('moo'))
            assert.strictEqual(await registered.execute(2), 'moomoo')
        })

        it('works with inheritance (no override)', async function () {
            class Foo2 extends Foo {
                public bar2(): number {
                    return this.s.length
                }
            }

            const bar1 = from(Foo2).declareBar('my.command1')
            const bar2 = from(Foo2).declareBar2('my.command2')

            const instance = new Foo2('zero')
            assert.strictEqual(await bar1.register(instance).execute(2), 'zerozero')
            assert.strictEqual(await bar2.register(instance).execute(), 4)
        })

        it('works with inheritance (override)', async function () {
            class Foo2 extends Foo {
                public override bar(p: number): string {
                    return this.s.toUpperCase().repeat(p)
                }
            }

            // The current implementation operates more like "traditional" inheritance
            // in that method bindings are static. Declaring a command from a class
            // results in that exact implementation being executed, not whatever
            // implementation exists at runtime. Dispatch at runtime would flip the results
            // of these these two cases, making the first lowercase and the other uppercase.
            //
            // While runtime dispatch is nice for ad-hoc behavioral changes, it can also
            // make things harder to reason about. Commands are not really meant to be
            // dynamic, so any kind of differing behavior should rely on composition or
            // parametric polymorphism rather than classical polymorphism.
            const declared1 = from(Foo2).declareBar('my.command')
            const command1 = declared1.register(new Foo('one'))
            assert.strictEqual(await command1.execute(2), 'ONEONE')

            const declared2 = from(Foo).declareBar('my.command2')
            const command2 = declared2.register(new Foo2('one'))
            assert.strictEqual(await command2.execute(3), 'oneoneone')
        })
    })
})
