/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Options to configure the behavior of the input box UI.
 * Generally used to accommodate features not provided through vscode.InputBoxOptions
 */
export interface AdditionalInputBoxOptions {
    title?: string
    step?: number
    totalSteps?: number
}

/**
 * @deprecated Use 'inputPrompter.ts' instead
 *
 * Creates an InputBox to get a text response from the user.
 *
 * Used to wrap createInputBox and accommodate
 * a common set of features for the Toolkit.
 *
 * Parameters:
 *  options - initial InputBox configuration
 *  buttons - set of buttons to initialize the InputBox with
 * @return A new InputBox.
 */
export function createInputBox({
    options,
    buttons,
}: {
    options?: vscode.InputBoxOptions & AdditionalInputBoxOptions
    buttons?: vscode.QuickInputButton[]
}): vscode.InputBox {
    const inputBox = vscode.window.createInputBox()

    if (options) {
        inputBox.title = options.title
        inputBox.placeholder = options.placeHolder
        inputBox.prompt = options.prompt
        inputBox.step = options.step
        inputBox.totalSteps = options.totalSteps
        if (options.ignoreFocusOut !== undefined) {
            inputBox.ignoreFocusOut = options.ignoreFocusOut
        }

        // TODO : Apply more options as they are needed in the future, and add corresponding tests
    }

    if (buttons) {
        inputBox.buttons = buttons
    }

    return inputBox
}

/**
 * Convenience method to allow the InputBox to be treated more like a dialog.
 *
 * This method shows the input box, and returns after the user enters a value, or cancels.
 * (Accepted = the user typed in a value and hit Enter, Cancelled = hide() is called or Esc is pressed)
 *
 * @param inputBox The InputBox to prompt the user with
 * @param onDidTriggerButton Optional event to trigger when the input box encounters a "Button Pressed" event.
 *  Buttons do not automatically cancel/accept the input box, caller must explicitly do this if intended.
 *
 * @returns If the InputBox was cancelled, undefined is returned. Otherwise, the string entered is returned.
 */
export async function promptUser({
    inputBox,
    onValidateInput,
    onDidTriggerButton,
}: {
    inputBox: vscode.InputBox
    onValidateInput?(value: string): string | undefined
    onDidTriggerButton?(
        button: vscode.QuickInputButton,
        resolve: (value: string | PromiseLike<string | undefined> | undefined) => void,
        reject: (reason?: any) => void
    ): void
}): Promise<string | undefined> {
    const disposables: vscode.Disposable[] = []

    try {
        const response = await new Promise<string | undefined>((resolve, reject) => {
            inputBox.onDidAccept(
                () => {
                    if (!inputBox.validationMessage) {
                        resolve(inputBox.value)
                    }
                },
                inputBox,
                disposables
            )

            inputBox.onDidHide(
                () => {
                    resolve(undefined)
                },
                inputBox,
                disposables
            )

            if (onValidateInput) {
                inputBox.onDidChangeValue(
                    value => {
                        inputBox.validationMessage = onValidateInput(value)
                    },
                    inputBox,
                    disposables
                )
            }

            if (onDidTriggerButton) {
                inputBox.onDidTriggerButton(
                    (btn: vscode.QuickInputButton) => onDidTriggerButton(btn, resolve, reject),
                    inputBox,
                    disposables
                )
            }

            inputBox.show()
        })

        return response
    } finally {
        disposables.forEach(d => d.dispose() as void)
        inputBox.hide()
    }
}
