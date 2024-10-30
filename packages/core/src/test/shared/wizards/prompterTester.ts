/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { TestInputBox, TestQuickPick } from '../vscode/quickInput'
import { getTestWindow, TestWindow } from '../vscode/window'

export class PrompterTester {
    private quickPickHandlers: Map<string, (input: TestQuickPick) => void> = new Map()
    private inputBoxHanlder: Map<string, (input: TestInputBox) => void> = new Map()
    private testWindow: TestWindow
    private calledOrder = 0
    private report = new Map<string, number>()

    private constructor(testWindow?: TestWindow) {
        this.testWindow = testWindow || getTestWindow()
    }

    static init(testWindow?: TestWindow): PrompterTester {
        return new PrompterTester(testWindow)
    }

    handleQuickPick(titlePattern: string, handler: (input: TestQuickPick) => void): PrompterTester {
        this.quickPickHandlers.set(titlePattern, handler)
        return this
    }

    handleInputBox(titlePattern: string, handler: (input: TestInputBox) => void): PrompterTester {
        this.inputBoxHanlder.set(titlePattern, handler)
        return this
    }

    build(): void {
        this.testWindow.onDidShowQuickPick((input) => {
            return this.handle(input, this.quickPickHandlers)
        })
        this.testWindow.onDidShowInputBox((input) => {
            return this.handle(input, this.inputBoxHanlder)
        })
    }

    private record(title: string): void {
        this.calledOrder++
        this.report.set(title, this.calledOrder)
    }

    public assertOrder(title: string, expectedOrder: number) {
        assert.strictEqual(this.report.get(title) || 0, expectedOrder)
    }

    private handle(input: any, handlers: any) {
        for (const [pattern, handler] of handlers) {
            if (input.title?.includes(pattern)) {
                handler(input)
                this.record(pattern)
            }
        }
    }
}
