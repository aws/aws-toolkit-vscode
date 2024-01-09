/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// Common prompter testing utilities

import { AssertionError, deepStrictEqual } from 'assert'
import { DataQuickPickItem, QuickPickPrompter } from '../../../shared/ui/pickerPrompter'
import { PromptResult } from '../../../shared/ui/prompter'
import { isKeyOf } from '../../../shared/utilities/tsUtils'
import { isTestQuickPick, PickerTester, TestQuickPick } from '../vscode/quickInput'
import { getLogger } from '../../../shared/logger'

type Methods<T> = PickerTester<DataQuickPickItem<T>> & {
    /**
     * Runs the given inputs and waits for the result or timeout.
     * Can optionally pass in an expected return value.
     *
     * This **must** be called and awaited, otherwise errors will not be surfaced correctly.
     */
    result(exptected?: PromptResult<T>): Promise<PromptResult<T>>
    /**
     * Executes the callback with a snapshot of the prompter in a given moment.
     *
     * This can be used for things such as setting up external state, asserting side-effects, or
     * inspecting the picker at test time.
     */
    addCallback(callback: (prompter?: QuickPickPrompter<T>) => Promise<any> | any): void
    hide(): void
}
export type QuickPickPrompterTester<T> = Methods<T> & QuickPickPrompter<T>

type Functions<T> = { [P in keyof T]: T[P] extends (...args: any[]) => any ? P : never }[keyof T]
type Action<T> = {
    [P in Functions<Methods<T>>]: [P, Parameters<Methods<T>[P]>]
}[Functions<Methods<T>>]

interface TestOptions {
    /** Amount of time to wait per action before stopping the test. */
    timeout?: number
    // TODO: add formatting options?
}

const testDefaults: Required<TestOptions> = {
    timeout: 5000,
}

/**
 * Creates a tester for quick picks.
 *
 * Tests are constructed as a series of 'actions' that are executed sequentially. Any action that
 * fails will immediately stop the test. The first action will always occur after the prompter is
 * both visible and enabled. Actions will always wait until the prompter is not busy/disabled before
 * continuing.
 *
 * @param prompter Prompter to test.
 * @param options Additional test options.
 *
 * @returns A {@link QuickPickPrompterTester}
 */
export function createQuickPickPrompterTester<T>(
    prompter: QuickPickPrompter<T>,
    options: TestOptions = {}
): QuickPickPrompterTester<T> {
    type AssertionParams = ConstructorParameters<typeof AssertionError>[0]
    const actions: Action<T>[] = []
    const errors: Error[] = []
    const traces: AssertionParams[] = []
    const testPicker = prompter.quickPick as TestQuickPick<DataQuickPickItem<T>>
    if (!isTestQuickPick(testPicker)) {
        throw new Error('Expected prompter to contain a TestQuickPick')
    }
    const resolvedOptions = { ...testDefaults, ...options }
    let running = false

    function throwErrorWithTrace(trace: AssertionParams, message: string, actual?: any, expected?: any) {
        errors.push(new AssertionError({ ...trace, message, actual, expected }))
        testPicker.hide()
    }

    /* Executes a test action. Immediately hides the picker on any error */
    async function executeAction(action: Action<T>, trace: AssertionParams): Promise<void> {
        const throwError = throwErrorWithTrace.bind(undefined, trace)

        const key = action[0]
        if (isKeyOf(key, testPicker)) {
            const fn = testPicker[key]
            try {
                await (fn as any)(...action[1])
            } catch (err) {
                errors.push(err as Error)
                testPicker.hide()
            }
        } else if (key === 'addCallback') {
            try {
                await action[1][0](prompter)
            } catch (err) {
                throwError(`Callback threw: ${(err as Error).message}`)
            }
        }
    }

    async function start(): Promise<void> {
        if (running) {
            return
        }
        running = true

        while (actions.length > 0) {
            const trace = traces.shift()!
            const timeout = setTimeout(() => throwErrorWithTrace(trace, 'Timed out'), resolvedOptions.timeout)
            await testPicker.untilReady()
            await executeAction(actions.shift()!, trace)
            clearTimeout(timeout)
        }
    }

    async function result(expected?: PromptResult<T>): Promise<PromptResult<T>> {
        start().catch(e => {
            getLogger().error('createQuickPickPrompterTester.start failed: %s', (e as Error).message)
        })
        const result = await prompter.prompt()
        if (errors.length > 0) {
            // TODO: combine errors into a single one
            throw errors[0]
        }
        if (arguments.length > 0) {
            deepStrictEqual(result, expected)
        }
        return result
    }

    const withTrace = <T extends (...args: any[]) => any>(f: T, name: string) => {
        return (...args: any[]) => {
            traces.push({ stackStartFn: f, operator: name, message: name })
            f(...args)
        }
    }

    prompter.onDidShow(start)

    return new Proxy(prompter, {
        get: (target, prop, recv) => {
            if (isKeyOf(prop, testPicker) || prop === 'addCallback') {
                return withTrace((...args) => actions.push([prop as any, args]), prop)
            }
            if (prop === 'result') {
                return result
            }
            return Reflect.get(target, prop, recv)
        },
    }) as any
}
