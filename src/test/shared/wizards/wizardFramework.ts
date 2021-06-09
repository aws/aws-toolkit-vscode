/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * New testing framework for wizard
 * 
 * Offers a more extensive testing experience by hooking into VS Code API calls
 * for simulating user input. This effectively blackboxes the concept of a wizard.
 * After a series of user inputs, we should expect the same output every time. 
 */

import * as vscode from 'vscode'
import { Wizard, WizardControl } from '../../../shared/wizards/wizard'
import * as assert from 'assert'
import { Prompter, PrompterButtons } from '../../../shared/ui/prompter'
import { DataQuickPickItem } from '../../../shared/ui/picker'

// Only button that we can support is the 'back' button currently
// TODO: stub out 'onDidTriggerButton' with our own event emitter
export enum WizardCommandType {
    BUTTON,
    QUICKPICK,
    INPUTBOX,
    FILTER,
    EXIT,
}

// Not applied recursively
type RegExpInterface<T> = {
    [Property in keyof T]: T[Property] extends string ? T[Property] | RegExp : T[Property]
}

type QuickPickData = RegExpInterface<vscode.QuickPickItem> | RegExpInterface<vscode.QuickPickItem>[]

export type WizardCommand = 
    [WizardCommandType.BUTTON, vscode.QuickInputButton] |
    [WizardCommandType.QUICKPICK, string | QuickPickData] |
    [WizardCommandType.INPUTBOX, string] |
    [WizardCommandType.FILTER, string] |
    [WizardCommandType.EXIT, undefined]

// These two functions exist in the new wizard two, so move them somewhere else (wizardUtils?)
function isQuickPick(prompter: any): prompter is vscode.QuickPick<any> {
    return prompter !== undefined && prompter.items !== undefined
}

function isInputBox(prompter: any): prompter is vscode.InputBox {
    return prompter !== undefined && prompter.password !== undefined
}

function isQuickPickItem(item: any): item is vscode.QuickPickItem {
    return item !== undefined && item.label !== undefined
}

function isQuickInputButton(item: any): item is vscode.QuickInputButton {
    return item !== undefined && item.label !== undefined
}

/**
 * Attempts to match the target to an item in the QuickPick item list.
 * String properties can use RegExp instead for partial matches.
 */
function selectQuickPickItem<T extends vscode.QuickPickItem>(
    quickPick: vscode.QuickPick<T>, 
    targetItem: RegExpInterface<vscode.QuickPickItem>
): vscode.QuickPickItem[] {
    const selected: vscode.QuickPickItem[] = []

    quickPick.items.forEach(item => {
        const isMatch = Object.keys(targetItem).map(key => key as (keyof vscode.QuickPickItem)).every(key => {
            const prop = targetItem[key]
            if (prop instanceof RegExp) {
                return typeof item[key] === 'string' && prop.test(item[key] as string)
            } else {
                return item[key] === targetItem[key]
            }
        })

        if (isMatch && !quickPick.selectedItems.includes(item)) {
            selected.push(item)
        }
    })

    return selected
}


async function execute(prompter: vscode.QuickInput & { buttons: PrompterButtons<any> }, [command, data]: WizardCommand): Promise<void> {
    switch (command) {
        case WizardCommandType.BUTTON: {
            assert.ok(isQuickInputButton(data), 'Button command must provide a QuickInputButton')
            prompter.buttons.forEach(button => {
                if (button.iconPath === data.iconPath) {
                    // TODO
                }
            })
            break
        }
        case WizardCommandType.QUICKPICK: {
            assert.ok(isQuickPick(prompter), 'Cannot execute QuickPick command on a non-QuickPick object')

            if (Array.isArray(data)) {
                prompter.selectedItems = Array.prototype.concat(data.forEach(item => selectQuickPickItem(prompter, item)))
            } else if(isQuickPickItem(data)) {
                prompter.selectedItems = selectQuickPickItem(prompter, data)
            } else if (typeof data === 'string') {
                prompter.selectedItems = selectQuickPickItem(prompter, { label: data })
            }

            assert.ok(prompter.selectedItems.length !== 0, `Target item(s) not found in QuickPick: ${data?.toString()}`)
            assert.ok(
                prompter.canSelectMany === true || prompter.selectedItems.length === 1,
                'Cannot select multiple QuickPick items when "canSelectMany" is false'
            )

            prompter.enabled = false
            //await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
            break
        }
        case WizardCommandType.INPUTBOX: {
            assert.ok(isInputBox(prompter), 'Cannot execute InputBox command on non-InputBox object.')

            if (typeof data === 'string') {
                prompter.value = data
            }

            await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
            break
        }
        case WizardCommandType.FILTER: {
            assert.ok(typeof data === 'string', 'Filter must be a string')
            assert.ok(isQuickPick(prompter), 'Filter can only be applied to a QuickPick')
            prompter.value = data
            break
        }
        case WizardCommandType.EXIT: {
            await vscode.commands.executeCommand('workbench.action.closeQuickOpen')
            break
        }
    }
}

export class WizardTester<TState, TResult> {
    private failedTestEmitter = new vscode.EventEmitter<Error>()

    // ideally we would reuse QuickInput objects for wizards (thus no need to test the wizard directly)
    // but since the prompts are being dynamically generated we need to poll for a new one after each
    // command
    constructor(
        private readonly wizard: Wizard<TState, TResult>, 
        private readonly commandSequence: WizardCommand[]
    ) {
    }

    public async step(prompter: Prompter<any>): Promise<void> {
        const command = this.commandSequence.shift()
        assert.ok(command !== undefined, 'Cannot execute an undefined wizard command')
        prompter.onReadyForInput(() => 
            execute(prompter.quickInput, command).catch(e => 
                this.failedTestEmitter.fire(new Error(`Wizard command "${command}" failed: ${e.message}`))
            )
        )
    }

    public async run(): Promise<TState | TResult | undefined> {
        this.wizard.onNextPrompt(prompter => this.step(prompter))
        const result = this.wizard.run()
        const failedPromise: Promise<any> = new Promise((_, reject) => this.failedTestEmitter.event(reject))

        return Promise.race([result, failedPromise])
    }
}

export class MockPrompter<T> extends Prompter<T> {
    constructor(private output: T | WizardControl | undefined) {
        super(vscode.window.createInputBox() as any)
    }
    public async prompt(): Promise<WizardControl | T | undefined> {
        return super.applyAfterCallbacks(this.output)
    }
    public setLastResponse(picked?: T | DataQuickPickItem<T> | DataQuickPickItem<T>[]): void {
        return
    }
    public getLastResponse(): undefined {
        return undefined
    }
}