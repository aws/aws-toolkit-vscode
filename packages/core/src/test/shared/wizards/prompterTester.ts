/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TestInputBox, TestQuickPick } from '../vscode/quickInput'
import { getTestWindow, TestWindow } from '../vscode/window'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'

interface PrompterTesterConfig {
    testWindow?: TestWindow
    handlerTimeout?: number
}

export class PrompterTester {
    private quickPickHandlers: Map<string, (input: TestQuickPick) => void> = new Map()
    private inputBoxHanlder: Map<string, (input: TestInputBox) => void> = new Map()
    private testWindow: TestWindow
    private callLog = Array<string>()
    private handlerTimeout: number = 3000 // Default timeout to 3 seconds
    private callLogCount = new Map<string, number>()

    private constructor(config?: PrompterTesterConfig) {
        this.testWindow = config?.testWindow || getTestWindow()
        this.handlerTimeout = config?.handlerTimeout || this.handlerTimeout
    }

    static init(config?: PrompterTesterConfig): PrompterTester {
        return new PrompterTester(config)
    }

    handleQuickPick(titlePattern: string, handler: (input: TestQuickPick) => void | Promise<void>): PrompterTester {
        this.quickPickHandlers.set(titlePattern, handler)
        this.callLogCount.set(titlePattern, 0)
        return this
    }

    handleInputBox(titlePattern: string, handler: (input: TestInputBox) => void | Promise<void>): PrompterTester {
        this.inputBoxHanlder.set(titlePattern, handler)
        this.callLogCount.set(titlePattern, 0)
        return this
    }

    build(): PrompterTester {
        this.testWindow.onDidShowQuickPick((input) => {
            return this.handle(input, this.quickPickHandlers)
        })
        this.testWindow.onDidShowInputBox((input) => {
            return this.handle(input, this.inputBoxHanlder)
        })
        return this
    }

    private record(title: string): void {
        this.callLog.push(title)
        this.callLogCount.set(title, (this.callLogCount.get(title) ?? 0) + 1)
    }

    /**
     * Asserts that a specific prompter handler has been called the expected number of times.
     *
     * @param title - The title prompter to check.
     * @param expectedCall - The expected number of times the prompted handler should have been called.
     * @throws AssertionError if the actual number of calls doesn't match the expected number.
     */
    assertCall(title: string, expectedCall: number) {
        assert.strictEqual(this.callLogCount.get(title), expectedCall, title)
    }

    /**
     * Asserts that a specific prompter handler was called in the expected order.
     *
     * @param title - The title or identifier of the handler to check.
     * @param expectedOrder - The expected position in the call order (one-based index).
     * @throws AssertionError if the handler wasn't called in the expected order.
     */
    assertCallOrder(title: string, expectedOrder: number) {
        assert.strictEqual(this.callLog[expectedOrder - 1], title)
    }

    /**
     * Asserts that all specified prompter handlers were called in the expected number of times.
     *
     * @param titles - The array of propmter handler titles to check.
     *                 If not provided, all registered handler titles are used
     * @param expectedCall - The expected number of times all specified handlers should have been called.
     *                       If not provided, it defaults to 1.
     * @throws AssertionError if the actual number of calls doesn't match the expected number.
     */
    assertCallAll(titles: string[] = this.getHandlers(), expectedOrder: number = 1) {
        titles.every((handler) => {
            this.assertCall(handler, expectedOrder)
        })
    }

    /**
     * Retrieves all registered handler titles.
     *
     * @returns An array of strings containing all handler titles, including both
     *          quick pick handlers and input box handlers.
     */
    getHandlers(): string[] {
        return [...this.quickPickHandlers.keys(), ...this.inputBoxHanlder.keys()]
    }

    private async handle(input: any, handlers: any) {
        const handler = handlers.get(input.title)

        if (!handler) {
            return this.handleUnknownPrompter(input)
        }

        try {
            await waitUntil(
                async () => {
                    await handler(input)
                    return true
                },
                { timeout: this.handlerTimeout, interval: 50, truthy: false }
            )
        } catch (e) {
            // clean up UI on callback function early exit (e.g assertion failure)
            await input.dispose()
            throw e
        }
        this.record(input.title)
    }

    private handleUnknownPrompter(input: any) {
        input.dispose()
        throw assert.fail(`Unexpected prompter titled: "${input.title}"`)
    }
}
