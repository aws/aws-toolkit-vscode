/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as picker from '../../../shared/ui/picker'
import { IteratorTransformer } from '../../../shared/utilities/collectionUtils'
import { IteratingQuickPickController } from '../../../shared/ui/iteratingPicker'

describe('IteratingQuickPickController', async function () {
    const values = ['a', 'b', 'c']
    const result = [{ label: 'A' }, { label: 'B' }, { label: 'C' }]
    const errMessage = 'ahhhhhhhhh!!!'
    const interval = 30

    let quickPick: vscode.QuickPick<vscode.QuickPickItem>
    let clock: FakeTimers.InstalledClock

    before(function () {
        clock = FakeTimers.install()
    })

    after(function () {
        clock.uninstall()
    })

    beforeEach(function () {
        clock.reset()
        quickPick = picker.createQuickPick<vscode.QuickPickItem>([]).quickPick
    })

    afterEach(function () {
        quickPick.dispose()
    })

    async function* iteratorFn(): AsyncIterator<string> {
        for (const [i, value] of values.entries()) {
            await new Promise<void>(resolve => {
                clock.setTimeout(() => {
                    resolve()
                }, interval)
            })
            if (i === values.length - 1) {
                return value
            }
            yield value
        }
    }

    function converter(val: string): vscode.QuickPickItem[] {
        if (val) {
            return [{ label: val.toUpperCase() }]
        }

        return []
    }

    async function* errIteratorFn(): AsyncIterator<string> {
        throw new Error(errMessage)
        yield 'nope'
    }

    async function* blankIteratorFn(): AsyncIterator<string> {}

    it('appends a refresh button to the quickPick', function () {
        new IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        assert.strictEqual(quickPick.buttons.length, 1)
        assert.strictEqual(quickPick.buttons[0], IteratingQuickPickController.REFRESH_BUTTON)
    })

    it('returns iterated values on start and on reset', async function () {
        const controller = new IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        controller.startRequests()

        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise<void>(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 3)
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()

        controller.reset()
        controller.startRequests()

        await clock.nextAsync()
        new Promise<void>(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 1)
                assert.deepStrictEqual(quickPick.items, [{ label: 'A' }])
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise<void>(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 3)
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('does not return additional values if start is called on a finished iterator', async function () {
        const controller = new IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        controller.startRequests()

        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise<void>(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 3)
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()

        controller.startRequests()
        await clock.nextAsync()
        new Promise<void>(resolve => {
            clock.setTimeout(() => {
                assert.strictEqual(quickPick.items.length, 3)
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('pauses and restarts iteration', async function () {
        const controller = new IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        // pause almost immediately. This should cause this to output a single item.
        controller.startRequests()
        new Promise<void>(resolve => {
            setTimeout(() => {
                controller.pauseRequests()
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise<void>(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, [{ label: 'A' }], `items at pause are: ${quickPick.items}`)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()

        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise<void>(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, result, `items at end are: ${quickPick.items}`)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('appends an error item', async function () {
        const controller = new IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => errIteratorFn(), converter)
        )

        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        new Promise<void>(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, [
                    {
                        ...IteratingQuickPickController.ERROR_ITEM,
                        detail: errMessage,
                    },
                ])
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('appends a no items item', async function () {
        const controller = new IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => blankIteratorFn(), converter)
        )

        controller.startRequests()
        await clock.nextAsync()
        new Promise<void>(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, [IteratingQuickPickController.NO_ITEMS_ITEM])
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    it('only appends values from the current refresh cycle', async function () {
        const controller = new IteratingQuickPickController(
            quickPick,
            new IteratorTransformer<string, vscode.QuickPickItem>(() => iteratorFn(), converter)
        )

        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        controller.reset()
        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        controller.reset()
        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        controller.reset()
        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        controller.reset()
        controller.startRequests()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()
        await clock.nextAsync()

        new Promise<void>(resolve => {
            setTimeout(() => {
                assert.deepStrictEqual(quickPick.items, result)
                resolve()
            }, interval - 15)
        })
        await clock.nextAsync()
    })

    describe('iteratingOnDidTriggerButton', async function () {
        class fakeIteratingQuickPickController extends IteratingQuickPickController<undefined> {
            public constructor(
                private readonly spy: sinon.SinonSpy,
                callback?: () => Promise<vscode.QuickPickItem[] | undefined>
            ) {
                super(
                    picker.createQuickPick([]).quickPick,
                    new IteratorTransformer(
                        () => {
                            return {
                                next: async () => {
                                    return { value: undefined, done: true }
                                },
                            }
                        },
                        () => []
                    ),
                    callback
                )
            }
            public async reset(): Promise<void> {
                this.spy()
            }
        }

        let sandbox: sinon.SinonSandbox

        beforeEach(function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(function () {
            sandbox.restore()
        })

        it('triggers a refresh and returns undefined', async function () {
            const spy = sandbox.spy()
            const controller = new fakeIteratingQuickPickController(spy)
            const out = await controller.iteratingOnDidTriggerButton(
                IteratingQuickPickController.REFRESH_BUTTON,
                () => {},
                () => {}
            )
            assert.strictEqual(out, undefined)
            assert.ok(spy.calledOnce)
        })

        it('returns undefined if no override is provided', async function () {
            const spy = sandbox.spy()
            const controller = new fakeIteratingQuickPickController(spy)
            const out = await controller.iteratingOnDidTriggerButton(
                { iconPath: new vscode.ThemeIcon('squirrel') },
                () => {},
                () => {}
            )
            assert.strictEqual(out, undefined)
            assert.ok(spy.notCalled)
        })

        it('returns a value from the override function', async function () {
            const spy = sandbox.spy()
            const callback = async () => {
                return items
            }
            const controller = new fakeIteratingQuickPickController(spy, callback)
            const items: vscode.QuickPickItem[] = [{ label: 'asdf' }, { label: 'jkl;' }]
            const out = await controller.iteratingOnDidTriggerButton(
                { iconPath: new vscode.ThemeIcon('squirrel') },
                () => {},
                () => {}
            )
            assert.deepStrictEqual(out, items)
            assert.ok(spy.notCalled)
        })
    })
})
