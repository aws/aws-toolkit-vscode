/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isKeyOf, isNonNullable, isThenable, Mutable } from '../../../shared/utilities/tsUtils'
import { SeverityLevel, ShownMessage, TestFileSystemDialog, TestMessage } from './message'
import { createTestInputBox, createTestQuickPick, TestInputBox, TestQuickPick } from './quickInput'
import { TestStatusBar } from './statusbar'

type Window = typeof vscode.window

export interface TestWindow {
    /**
     * The status bar contains a list of statuses and is located at the bottom of the window
     *
     * Affected by:
     * - {@link vscode.window.withProgress}
     * - {@link vscode.window.setStatusBarMessage}
     * - {@link vscode.window.createStatusBarItem}
     */
    readonly statusBar: TestStatusBar

    /**
     * Only a single quick input (quick pick or input box) can be visible at any time
     *
     * Affected by:
     * - {@link vscode.window.showInputBox}
     * - {@link vscode.window.showQuickPick}
     * - {@link vscode.window.createInputBox}
     * - {@link vscode.window.createQuickPick}
     */
    readonly activeQuickInput: TestQuickPick | TestInputBox | undefined

    /**
     * A list of all shown messages
     *
     * Affected by:
     * - {@link vscode.window.withProgress}
     * - {@link vscode.window.showInformationMessage}
     * - {@link vscode.window.showWarningMessage}
     * - {@link vscode.window.showErrorMessage}
     */
    readonly shownMessages: ShownMessage[]

    /**
     * A list of all shown file system dialogs
     *
     * Affected by:
     * - {@link vscode.window.showOpenDialog}
     * - {@link vscode.window.showSaveDialog}
     */
    readonly shownDialogs: TestFileSystemDialog[]

    /**
     * A list of all shown quick picks
     *
     * Affected by:
     * - {@link vscode.window.showQuickPick}
     * - {@link vscode.window.createQuickPick}
     */
    readonly shownQuickPicks: TestQuickPick[]

    /**
     * A list of all shown input boxes
     *
     * Affected by:
     * - {@link vscode.window.showInputBox}
     * - {@link vscode.window.createInputBox}
     */
    readonly shownInputBoxes: TestInputBox[]

    /**
     * Fired whenever a file system dialog is shown (see {@link shownDialogs})
     */
    readonly onDidShowDialog: vscode.Event<TestFileSystemDialog>

    /**
     * Fired whenever a notification or modal message is shown (see {@link shownMessages})
     */
    readonly onDidShowMessage: vscode.Event<ShownMessage>

    /**
     * Fired whenever a picker is shown (see {@link shownQuickPicks})
     */
    readonly onDidShowQuickPick: vscode.Event<TestQuickPick>

    /**
     * Fired whenever an input box is shown (see {@link shownInputBoxes})
     */
    readonly onDidShowInputBox: vscode.Event<TestInputBox>

    /**
     * Fired whenever a listener callback attached to the test window throws an error
     */
    readonly onError: vscode.Event<{ event: vscode.Disposable; error: unknown }>

    /**
     * Waits for a message to appear that matches the expected text
     *
     * Rejects if no message is found within the given timeout period (milliseconds)
     */
    waitForMessage(expected: string | RegExp, timeout?: number): Promise<ShownMessage>
    getFirstMessage(): ShownMessage
    getSecondMessage(): ShownMessage
    getThirdMessage(): ShownMessage
    dispose(): void
}

type StateKeys<T> = { [P in keyof T]: T[P] extends (...args: any[]) => any ? never : P }[keyof T]
type State<T> = Mutable<Pick<T, StateKeys<T>>>

/**
 * A test window proxies {@link vscode.window}, intercepting calls whilst
 * allowing for introspection and mocking as-needed.
 */
export function createTestWindow(workspace = vscode.workspace): Window & TestWindow {
    // TODO: write mix-in Proxy factory function
    const emitters = {
        onDidShowMessage: createTestEventEmitter<ShownMessage>(),
        onDidShowQuickPick: createTestEventEmitter<TestQuickPick>(),
        onDidShowInputBox: createTestEventEmitter<TestInputBox>(),
        onDidShowDialog: createTestEventEmitter<TestFileSystemDialog>(),
    }

    const state: State<TestWindow> = {
        activeQuickInput: undefined,
        shownMessages: [],
        shownQuickPicks: [],
        shownInputBoxes: [],
        shownDialogs: [],
        statusBar: new TestStatusBar(vscode.window),
    }

    const onErrorEmitter = new vscode.EventEmitter<{ event: vscode.Disposable; error: unknown }>()
    for (const emitter of Object.values(emitters)) {
        emitter.onError(onErrorEmitter.fire.bind(onErrorEmitter))
    }

    function dispose() {
        vscode.Disposable.from(...Object.values(emitters), onErrorEmitter).dispose()
    }

    function fireOnDidShowMessage(message: ShownMessage) {
        state.shownMessages.push(message)
        emitters.onDidShowMessage.fire(message)
    }

    function fireOnDidShowDialog(dialog: TestFileSystemDialog) {
        state.shownDialogs.push(dialog)
        emitters.onDidShowDialog.fire(dialog)
    }

    function fireOnDidShowQuickPick(picker: TestQuickPick) {
        if (!state.shownQuickPicks.includes(picker)) {
            state.shownQuickPicks.push(picker)
        }
        emitters.onDidShowQuickPick.fire(picker)
        setActiveQuickInput(picker)
    }

    function fireOnDidShowInputBox(inputBox: TestInputBox) {
        if (!state.shownInputBoxes.includes(inputBox)) {
            state.shownInputBoxes.push(inputBox)
        }
        emitters.onDidShowInputBox.fire(inputBox)
        setActiveQuickInput(inputBox)
    }

    function setActiveQuickInput(input: TestQuickPick | TestInputBox) {
        state.activeQuickInput?.hide()
        state.activeQuickInput = input
        const sub = input.onDidHide(() => {
            sub.dispose()
            if (state.activeQuickInput === input) {
                state.activeQuickInput = undefined
            }
        })
    }

    const target = vscode.window
    function createQuickPick<T extends vscode.QuickPickItem>(
        ...args: Parameters<typeof vscode.window.createQuickPick<T>>
    ): ReturnType<typeof vscode.window.createQuickPick<T>> {
        const picker = createTestQuickPick<T>(target.createQuickPick(...args))
        picker.onDidShow(() => fireOnDidShowQuickPick(picker))

        return picker
    }

    function showQuickPick<T extends vscode.QuickPickItem>(
        ...args: Parameters<typeof vscode.window.showQuickPick<T>>
    ): ReturnType<typeof vscode.window.showQuickPick<T>> {
        const [items, options, token] = args
        const picker = createQuickPick()
        const onDidSelectItem = options?.onDidSelectItem?.bind(options)
        if (onDidSelectItem) {
            picker.onDidChangeSelection(items => items.forEach(onDidSelectItem))
        }

        const stringItem = Symbol()
        const setItems = (arg: string[] | vscode.QuickPickItem[]) => {
            picker.items = arg.map(v =>
                typeof v !== 'string'
                    ? v
                    : {
                          label: v,
                          [stringItem]: v,
                      }
            )
        }

        let itemsPromise: Promise<T[]>

        if (Array.isArray(items)) {
            itemsPromise = Promise.resolve(items)
        } else if (items instanceof Promise) {
            itemsPromise = items
        } else {
            // Not sure what this type is
            throw new Error('Not implemented')
        }

        picker.canSelectMany = options?.canPickMany ?? false
        picker.placeholder = options?.placeHolder
        picker.ignoreFocusOut = options?.ignoreFocusOut ?? false
        picker.matchOnDetail = options?.matchOnDetail ?? false
        picker.matchOnDescription = options?.matchOnDescription ?? false
        token?.onCancellationRequested(() => picker.dispose())

        return itemsPromise.then(items => {
            setItems(items)

            return new Promise((resolve, reject) => {
                picker.onDidHide(() => resolve(undefined))
                picker.onDidAccept(() => {
                    const selected = picker.selectedItems.map(i =>
                        isKeyOf(stringItem, i) ? (i[stringItem] as string) : i
                    )
                    resolve(picker.canSelectMany ? (selected as any) : (selected[0] as any))
                })

                picker.show()
            })
        })
    }

    function createInputBox(...args: Parameters<Window['createInputBox']>): ReturnType<Window['createInputBox']> {
        const inputBox = createTestInputBox(target.createInputBox(...args))
        inputBox.onDidShow(() => fireOnDidShowInputBox(inputBox))

        return inputBox
    }

    function showInputBox(...args: Parameters<Window['showInputBox']>): ReturnType<Window['showInputBox']> {
        const [options, token] = args
        const inputBox = createInputBox()
        const validateInput = options?.validateInput?.bind(options)
        if (validateInput) {
            inputBox.onDidChangeValue(v => {
                const validationMessage = validateInput(v)
                if (
                    !isThenable(validationMessage) ||
                    typeof validationMessage === 'string' ||
                    validationMessage === undefined
                ) {
                    inputBox.validationMessage = isNonNullable(validationMessage) ? validationMessage : undefined
                } else {
                    validationMessage?.then(
                        val => (val || val === undefined ? (inputBox.validationMessage = val) : void 0),
                        e => {
                            console.error('showInputBox.validationMessage: %s', (e as Error).message)
                        }
                    )
                }
            })
        }

        inputBox.placeholder = options?.placeHolder
        inputBox.password = options?.password ?? false
        inputBox.value = options?.value ?? ''
        inputBox.ignoreFocusOut = options?.ignoreFocusOut ?? false
        inputBox.prompt = options?.prompt
        token?.onCancellationRequested(() => inputBox.dispose())

        return new Promise<string | undefined>((resolve, reject) => {
            inputBox.onDidHide(() => resolve(undefined))
            inputBox.onDidAccept(() => resolve(inputBox.value))

            inputBox.show()
        })
    }

    function withProgress<R>(
        ...args: Parameters<typeof vscode.window.withProgress<R>>
    ): ReturnType<typeof vscode.window.withProgress<R>> {
        const [options, task] = args
        const tokenSource = new vscode.CancellationTokenSource()
        if (options.location === vscode.ProgressLocation.Notification) {
            const progress: Parameters<typeof task>[0] & { notification?: ShownMessage } = {
                report(value) {
                    if (!this.notification) {
                        throw new Error('Progress was reported before the notification was shown')
                    }
                    this.notification.updateProgress(value)
                },
            }
            const cancelItem: vscode.MessageItem = { title: 'Cancel' }
            const items = options.cancellable ? [cancelItem] : []
            const showMessage = TestMessage.createShowMessageFn(SeverityLevel.Progress, message => {
                progress.notification = message
                fireOnDidShowMessage(message)
            })

            void showMessage(options.title ?? '', ...items).then(resp => {
                if (resp === cancelItem) {
                    tokenSource.cancel()
                }
            })

            return Promise.resolve(task(progress, tokenSource.token)).finally(() => {
                progress.notification?.dispose()
                tokenSource.dispose()
            })
        } else if (options.location === vscode.ProgressLocation.Window) {
            const statusBarItem = state.statusBar.createStatusBarItem()
            const progress: Parameters<typeof task>[0] = {
                report(value) {
                    const message = value.message ?? ''
                    statusBarItem.text = options.title ? `${options.title}${message ? ': ' : ''}${message}` : message
                },
            }
            statusBarItem.show()

            return Promise.resolve(task(progress, tokenSource.token)).finally(() => {
                statusBarItem.dispose()
                tokenSource.dispose()
            })
        }

        return target.withProgress(options, task)
    }

    function waitForMessage(expected: string | RegExp, timeout: number = 5000) {
        return new Promise<ShownMessage>((resolve, reject) => {
            const alreadyShown = state.shownMessages.find(m => m.visible && m.message.match(expected))
            if (alreadyShown) {
                return resolve(alreadyShown)
            }

            const sub = emitters.onDidShowMessage.event(shownMessage => {
                if (shownMessage.message.match(expected)) {
                    sub.dispose()
                    resolve(shownMessage)
                }
            })
            setTimeout(() => {
                sub.dispose()
                reject(new Error(`Timed out waiting for message: ${expected}`))
            }, timeout)
        })
    }

    function getMessageOrThrow(index: number) {
        if (state.shownMessages.length === 0) {
            throw new Error('No messages have been shown')
        }

        const message = state.shownMessages[index]
        if (message === undefined) {
            const messages = state.shownMessages.map(m => m.printDebug()).join('\n')
            throw new Error(`No message found at index ${index}. Current state:\n${messages}`)
        }

        return message
    }

    type Fields = keyof typeof state | keyof typeof emitters
    const methods: Partial<Omit<Window & TestWindow, Fields>> = {
        dispose,
        setStatusBarMessage: state.statusBar.setStatusBarMessage.bind(state.statusBar),
        createStatusBarItem: state.statusBar.createStatusBarItem.bind(state.statusBar),
        waitForMessage: waitForMessage,
        getFirstMessage: getMessageOrThrow.bind(undefined, 0),
        getSecondMessage: getMessageOrThrow.bind(undefined, 1),
        getThirdMessage: getMessageOrThrow.bind(undefined, 2),
        showInputBox: showInputBox,
        showQuickPick: showQuickPick,
        createInputBox: createInputBox,
        createQuickPick: createQuickPick,
        withProgress: withProgress,
        showInformationMessage: TestMessage.createShowMessageFn(SeverityLevel.Information, fireOnDidShowMessage),
        showWarningMessage: TestMessage.createShowMessageFn(SeverityLevel.Warning, fireOnDidShowMessage),
        showErrorMessage: TestMessage.createShowMessageFn(SeverityLevel.Error, fireOnDidShowMessage),
        showOpenDialog: TestFileSystemDialog.createOpenSaveDialogFn(workspace.fs, fireOnDidShowDialog),
        showSaveDialog: TestFileSystemDialog.createShowSaveDialogFn(workspace.fs, fireOnDidShowDialog),
        onError: onErrorEmitter.event,
    }

    return new Proxy(vscode.window, {
        get: (target, prop: keyof (Window & TestWindow), recv) => {
            if (isKeyOf(prop, emitters)) {
                return emitters[prop].event
            }
            if (isKeyOf(prop, state)) {
                return state[prop]
            }
            if (isKeyOf(prop, methods)) {
                return methods[prop]
            }

            return Reflect.get(target, prop, recv)
        },
        set: (_, prop) => {
            throw new Error(`The test window should not be mutated. Caller tried to change field "${String(prop)}"`)
        },
    }) as Window & TestWindow
}

let testWindow: ReturnType<typeof createTestWindow> | undefined

/**
 * Gets a testable version of {@link vscode.window} for the current test execution
 *
 * See {@link TestWindow} for a list of additional fields and methods.
 */
export function getTestWindow(): ReturnType<typeof createTestWindow> {
    return (testWindow ??= createTestWindow())
}

/**
 * Disposes the active test window, allowing a new one to be created
 *
 * **This currently does not reset the window for the current test execution!**
 */
export function resetTestWindow(): void {
    testWindow?.dispose()
    testWindow = undefined
}

/**
 * Throws if there any error messages were shown during the test run
 */
export function assertNoErrorMessages() {
    const errors = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Error)
    if (errors.length > 0) {
        const messages = errors.map(m => m.message).join('\n')
        throw new Error(`The following error messages were shown: ${messages}`)
    }
}

export function printPendingUiElements(window = getTestWindow()) {
    const parts: string[] = []
    const messages = window.shownMessages.filter(m => m.visible)
    const dialogs = window.shownDialogs.filter(d => d.visible)

    if (messages.length > 0) {
        parts.push('Messages:', ...messages.map(m => `  ${m.printDebug()}`))
    }
    if (dialogs.length > 0) {
        parts.push('File System Dialogs:', ...dialogs.map(d => `  ${d.printDebug()}`))
    }
    if (window.activeQuickInput?.visible) {
        parts.push('Quick Inputs: ', `  ${window.activeQuickInput.title}`)
    }

    return parts.length > 0 ? ['Pending UI Elements:', ...parts].join('\n') : '[No Pending UI Elements Found]'
}

type TestEventEmitter<T> = vscode.EventEmitter<T> & {
    readonly onError: vscode.Event<{ event: T; error: unknown }>
}

/**
 * Catches and propagates any errors emitted by event listeners
 */
export function createTestEventEmitter<T>(): TestEventEmitter<T> {
    const emitter = new vscode.EventEmitter<T>()
    const errorEmitter = new vscode.EventEmitter<{ event: T; error: unknown }>()

    return new Proxy(emitter, {
        get: (target, prop: keyof TestEventEmitter<T>, recv) => {
            if (prop === 'onError') {
                return errorEmitter.event
            }
            if (prop === 'dispose') {
                return function () {
                    return vscode.Disposable.from(target, errorEmitter).dispose()
                }
            }
            if (prop === 'event') {
                return function (cb: (event: any) => unknown) {
                    return emitter.event(async event => {
                        try {
                            await cb(event)
                        } catch (error) {
                            errorEmitter.fire({ event, error })
                        }
                    })
                }
            }
            return Reflect.get(target, prop, recv)
        },
    }) as TestEventEmitter<T>
}
