/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SeverityLevel, ShownMessage, TestFileSystemDialog, TestMessage } from './message'
import { createTestInputBox, createTestQuickPick, TestInputBox, TestQuickPick } from './quickInput'
import { TestStatusBar } from './statusbar'

type Window = typeof vscode.window

export interface TestWindow {
    readonly statusBar: TestStatusBar
    readonly activeQuickInput: TestQuickPick | TestInputBox | undefined
    readonly shownMessages: ShownMessage[]
    readonly shownDialogs: TestFileSystemDialog[]
    readonly shownQuickPicks: TestQuickPick[]
    readonly shownInputBoxes: TestInputBox[]
    onDidShowDialog: vscode.Event<TestFileSystemDialog>
    onDidShowMessage: vscode.Event<ShownMessage>
    onDidShowQuickPick: vscode.Event<TestQuickPick>
    onDidShowInputBox: vscode.Event<TestInputBox>
    waitForMessage(expected: string | RegExp, timeout?: number): Promise<ShownMessage>
    getFirstMessage(): ShownMessage
    getSecondMessage(): ShownMessage
    getThirdMessage(): ShownMessage
    onError: vscode.Event<{ event: vscode.Disposable; error: unknown }>
    // useFileSystem(fs: vscode.FileSystem): void
    dispose(): void
}

/**
 * A test window proxies {@link vscode.window}, intercepting calls whilst
 * allowing for introspection and mocking as-needed.
 */
export function createTestWindow(fs = vscode.workspace.fs): Window & TestWindow {
    // TODO: write mix-in Proxy factory function
    const onDidShowMessageEmitter = createTestEventEmitter<ShownMessage>()
    const onDidShowQuickPickEmitter = createTestEventEmitter<TestQuickPick>()
    const onDidShowInputBoxEmitter = createTestEventEmitter<TestInputBox>()
    const onDidShowDialogEmitter = createTestEventEmitter<TestFileSystemDialog>()
    const shownMessages: ShownMessage[] = []
    const shownQuickPicks: TestQuickPick[] = []
    const shownInputBoxes: TestInputBox[] = []
    const shownDialogs: TestFileSystemDialog[] = []
    const statusBar = new TestStatusBar(vscode.window)

    const onErrorEmitter = new vscode.EventEmitter<{ event: vscode.Disposable; error: unknown }>()
    for (const emitter of [onDidShowMessageEmitter, onDidShowQuickPickEmitter, onDidShowInputBoxEmitter]) {
        emitter.onError(onErrorEmitter.fire.bind(onErrorEmitter))
    }

    function dispose() {
        vscode.Disposable.from(
            onDidShowMessageEmitter,
            onDidShowQuickPickEmitter,
            onDidShowInputBoxEmitter,
            onErrorEmitter
        ).dispose()
    }

    function fireOnDidShowMessage(message: ShownMessage) {
        shownMessages.push(message)
        onDidShowMessageEmitter.fire(message)
    }

    function fireOnDidShowDialog(dialog: TestFileSystemDialog) {
        shownDialogs.push(dialog)
        onDidShowDialogEmitter.fire(dialog)
    }

    function createQuickPick(
        this: Window,
        ...args: Parameters<Window['createQuickPick']>
    ): ReturnType<Window['createQuickPick']> {
        const picker = createTestQuickPick(this.createQuickPick(...args))
        picker.onDidShow(() => {
            if (!shownQuickPicks.includes(picker)) {
                shownQuickPicks.push(picker)
            }
            onDidShowQuickPickEmitter.fire(picker)
        })

        return picker
    }

    // TODO: handle string overload
    function showQuickPick(
        this: Window,
        ...args: Parameters<Window['showQuickPick']>
    ): ReturnType<Window['showQuickPick']> {
        const [items, options, token] = args
        const picker = createQuickPick.call(this)
        const onDidSelectItem = options?.onDidSelectItem?.bind(options)
        if (onDidSelectItem) {
            picker.onDidChangeSelection(items => items.forEach(onDidSelectItem))
        }

        if (Array.isArray(items)) {
            picker.items = items
        } else {
            items.then(val => (picker.items = val))
        }

        picker.canSelectMany = options?.canPickMany ?? false
        picker.placeholder = options?.placeHolder
        picker.ignoreFocusOut = options?.ignoreFocusOut ?? false
        picker.matchOnDetail = options?.matchOnDetail ?? false
        picker.matchOnDescription = options?.matchOnDescription ?? false
        token?.onCancellationRequested(() => picker.dispose())

        return new Promise((resolve, reject) => {
            picker.onDidHide(() => resolve(undefined))
            picker.onDidAccept(() => {
                if (picker.canSelectMany) {
                    resolve(picker.selectedItems as any)
                } else {
                    resolve(picker.selectedItems[0])
                }
            })

            picker.show()
        })
    }

    function createInputBox(
        this: Window,
        ...args: Parameters<Window['createInputBox']>
    ): ReturnType<Window['createInputBox']> {
        const inputBox = createTestInputBox(this.createInputBox(...args))
        inputBox.onDidShow(() => {
            if (!shownInputBoxes.includes(inputBox)) {
                shownInputBoxes.push(inputBox)
            }
            onDidShowInputBoxEmitter.fire(inputBox)
        })

        return inputBox
    }

    function showInputBox(
        this: Window,
        ...args: Parameters<Window['showInputBox']>
    ): ReturnType<Window['showInputBox']> {
        const [options, token] = args
        const inputBox = createInputBox.call(this)
        const validateInput = options?.validateInput?.bind(options)
        if (validateInput) {
            inputBox.onDidChangeValue(v => {
                const validationMessage = validateInput(v)
                if (typeof validationMessage === 'string' || validationMessage === undefined) {
                    inputBox.validationMessage = validationMessage
                } else {
                    validationMessage?.then(val =>
                        val || val === undefined ? (inputBox.validationMessage = val) : void 0
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

    function withProgress(
        this: Window,
        ...args: Parameters<Window['withProgress']>
    ): ReturnType<Window['withProgress']> {
        const [options, task] = args
        if (options.location === vscode.ProgressLocation.Notification) {
            const progress: Parameters<typeof task>[0] & { notification?: ShownMessage } = {
                report(value) {
                    if (!this.notification) {
                        throw new Error('Progress was reported before the notification was shown')
                    }
                    this.notification.updateProgress(value)
                },
            }
            const tokenSource = new vscode.CancellationTokenSource()
            const cancelItem = 'Cancel'
            const items = options.cancellable ? [cancelItem] : []
            const showMessage = TestMessage.create(SeverityLevel.Information, message => {
                progress.notification = message
                fireOnDidShowMessage(message)
            })

            showMessage(options.title ?? '', ...items).then(resp => {
                if (resp === cancelItem) {
                    tokenSource.cancel()
                }
            })

            return Promise.resolve(task(progress, tokenSource.token)).finally(() => tokenSource.dispose())
        }

        return this.withProgress(options, task)
    }

    function waitForMessage(expected: string | RegExp, timeout: number = 5000) {
        return new Promise<ShownMessage>((resolve, reject) => {
            const alreadyShown = shownMessages.find(m => m.visible && m.message.match(expected))
            if (alreadyShown) {
                return resolve(alreadyShown)
            }

            const d = onDidShowMessageEmitter.event(shownMessage => {
                if (shownMessage.message.match(expected)) {
                    d.dispose()
                    resolve(shownMessage)
                }
            })
            setTimeout(() => {
                d.dispose()
                reject(new Error(`Timed out waiting for message: ${expected}`))
            }, timeout)
        })
    }

    function getMessageOrThrow(index: number) {
        if (shownMessages.length === 0) {
            throw new Error('No messages have been shown')
        }

        const message = shownMessages[index]
        if (message === undefined) {
            throw new Error(`No message found at index ${index}. Current state:\n${renderMessages(shownMessages)}`)
        }

        return message
    }

    return new Proxy(vscode.window, {
        get: (target, prop: keyof Window & TestWindow, recv) => {
            switch (prop) {
                case 'statusBar':
                    return statusBar
                case 'shownMessages':
                    return shownMessages
                case 'shownQuickPicks':
                    return shownQuickPicks
                case 'shownInputBoxes':
                    return shownInputBoxes
                case 'onDidShowMessage':
                    return onDidShowMessageEmitter.event
                case 'onDidShowQuickPick':
                    return onDidShowQuickPickEmitter.event
                case 'onDidShowInputBox':
                    return onDidShowInputBoxEmitter.event
                case 'onDidShowDialog':
                    return onDidShowDialogEmitter.event
                case 'setStatusBarMessage':
                    return statusBar.setStatusBarMessage.bind(statusBar)
                case 'createStatusBarItem':
                    return statusBar.createStatusBarItem.bind(statusBar)
                case 'waitForMessage':
                    return waitForMessage
                case 'getFirstMessage':
                    return getMessageOrThrow.bind(target, 0)
                case 'getSecondMessage':
                    return getMessageOrThrow.bind(target, 1)
                case 'getThirdMessage':
                    return getMessageOrThrow.bind(target, 2)
                case 'showInputBox':
                    return showInputBox.bind(target)
                case 'showQuickPick':
                    return showQuickPick.bind(target)
                case 'createInputBox':
                    return createInputBox.bind(target)
                case 'createQuickPick':
                    return createQuickPick.bind(target)
                case 'withProgress':
                    return withProgress.bind(target)
                case 'showInformationMessage':
                    return TestMessage.create(SeverityLevel.Information, fireOnDidShowMessage)
                case 'showWarningMessage':
                    return TestMessage.create(SeverityLevel.Warning, fireOnDidShowMessage)
                case 'showErrorMessage':
                    return TestMessage.create(SeverityLevel.Error, fireOnDidShowMessage)
                case 'showOpenDialog':
                    return TestFileSystemDialog.createOpen(fs, fireOnDidShowDialog)
                case 'showSaveDialog':
                    return TestFileSystemDialog.createSave(fs, fireOnDidShowDialog)
                case 'dispose':
                    return dispose
                case 'onError':
                    return onErrorEmitter.event
                default:
                    return Reflect.get(target, prop, recv)
            }
        },
    }) as Window & TestWindow
}

function renderMessages(messages: ShownMessage[]) {
    return messages.map(m => m.printDebug()).join('\n')
}

let testWindow: ReturnType<typeof createTestWindow> | undefined

export function getTestWindow(): ReturnType<typeof createTestWindow> {
    return (testWindow ??= createTestWindow())
}

export function resetTestWindow(): void {
    testWindow?.dispose()
    testWindow = undefined
}

export function assertNoErrorMessages() {
    const errors = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Error)
    if (errors.length > 0) {
        const state = errors.map(m => m.message).join('\n')
        throw new Error(`The following error messages were shown: ${state}`)
    }
}

type TestEventEmitter<T> = vscode.EventEmitter<T> & {
    readonly onError: vscode.Event<{ event: T; error: unknown }>
}

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
