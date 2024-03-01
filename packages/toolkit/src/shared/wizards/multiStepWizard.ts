/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as os from 'os'
import * as vscode from 'vscode'

import * as picker from '../../shared/ui/picker'
import { addCodiconToString } from '../utilities/textUtilities'
import { getLogger } from '../logger/logger'
import { openUrl } from '../utilities/vsCodeUtils'

export interface WizardStep {
    (stepNumber: number): Thenable<Transition>
}

export interface Transition {
    nextState: WizardNextState
    nextStep?: WizardStep
}

export enum WizardNextState {
    /** Instruct the wizard to continue to a new step. Consider using the helper function {@link wizardContinue} instead. */
    CONTINUE,
    /** Instruct the wizard to retry the current step. Consider using the const {@link WIZARD_RETRY} instead. */
    RETRY,
    /** Instruct the wizard to go back to the previous step. Consider using the const{@link WIZARD_GOBACK} instead. */
    GO_BACK,
    /** Instruct the wizard to terminate. Consider using the const {@link WIZARD_TERMINATE} instead. */
    TERMINATE,
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const WIZARD_RETRY: Transition = {
    nextState: WizardNextState.RETRY,
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const WIZARD_TERMINATE: Transition = {
    nextState: WizardNextState.TERMINATE,
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const WIZARD_GOBACK: Transition = {
    nextState: WizardNextState.GO_BACK,
}

export function wizardContinue(step: WizardStep): Transition {
    return {
        nextState: WizardNextState.CONTINUE,
        nextStep: step,
    }
}

/**
 * @deprecated Use `wizard.ts` with `wizardForm.ts` instead.
 */
export abstract class MultiStepWizard<TResult> {
    protected constructor() {}

    public async run(): Promise<TResult | undefined> {
        let steps: WizardStep[] = [this.startStep]

        // in a wizard, it only make sense to go forwards to an arbitrary step, or backwards in history
        while (steps.length > 0) {
            const step = steps[steps.length - 1]
            // non-terminal if we still have steps
            if (step === undefined) {
                getLogger().warn('encountered an undefined step, terminating wizard')
                break
            }
            const result = await step(steps.length)

            switch (result.nextState) {
                case WizardNextState.TERMINATE:
                    // success/failure both handled by getResult()
                    steps = []
                    break
                case WizardNextState.RETRY:
                    // retry the current step
                    break
                case WizardNextState.GO_BACK:
                    // let history unwind
                    steps.pop()
                    break
                case WizardNextState.CONTINUE:
                    // push the next step to run
                    steps.push(result.nextStep!)
                    break
                default:
                    throw new Error(`unhandled transition in MultiStepWizard: ${result.nextState}`)
            }
        }

        return this.getResult()
    }

    protected abstract get startStep(): WizardStep

    protected abstract getResult(): TResult | undefined
}

export interface FolderQuickPickItem extends vscode.QuickPickItem {
    getUri(): Thenable<vscode.Uri | undefined>
}

export class WorkspaceFolderQuickPickItem implements FolderQuickPickItem {
    public readonly label: string

    public constructor(private readonly folder: vscode.WorkspaceFolder) {
        this.label = addCodiconToString('root-folder-opened', folder.name)
    }

    public async getUri(): Promise<vscode.Uri | undefined> {
        return this.folder.uri
    }
}

export class WizardContext {
    public readonly showOpenDialog = vscode.window.showOpenDialog
    public get workspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
        return vscode.workspace.workspaceFolders
    }
}

export class BrowseFolderQuickPickItem implements FolderQuickPickItem {
    public alwaysShow: boolean = true

    public constructor(private readonly context: WizardContext, public readonly detail: string) {}

    public get label(): string {
        if (this.context.workspaceFolders && this.context.workspaceFolders.length > 0) {
            return addCodiconToString(
                'folder-opened',
                localize('AWS.initWizard.location.select.folder', 'Select a different folder...')
            )
        }

        return localize(
            'AWS.initWizard.location.select.folder.empty.workspace',
            'There are no workspace folders open. Select a folder...'
        )
    }

    public async getUri(): Promise<vscode.Uri | undefined> {
        const workspaceFolders = this.context.workspaceFolders
        const defaultUri =
            !!workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : vscode.Uri.file(os.homedir())

        const result = await this.context.showOpenDialog({
            defaultUri,
            openLabel: localize('AWS.samcli.initWizard.name.browse.openLabel', 'Open'),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
        })

        if (!result || !result.length) {
            return undefined
        }

        return result[0]
    }
}

export async function promptUserForLocation(
    context: WizardContext,
    additionalParams?: {
        helpButton?: { button: vscode.QuickInputButton; url: string }
        overrideText?: { detail?: string; title?: string }
        step?: number
        totalSteps?: number
    }
): Promise<vscode.Uri | undefined> {
    const items: FolderQuickPickItem[] = (context.workspaceFolders || [])
        .map<FolderQuickPickItem>(f => new WorkspaceFolderQuickPickItem(f))
        .concat([
            new BrowseFolderQuickPickItem(
                context,
                additionalParams?.overrideText?.detail
                    ? additionalParams.overrideText.detail
                    : localize(
                          'AWS.wizard.location.select.folder.detail',
                          'The selected folder will be added to the workspace.'
                      )
            ),
        ])

    const quickPick = picker.createQuickPick({
        options: {
            ignoreFocusOut: true,
            title: additionalParams?.overrideText?.title
                ? additionalParams.overrideText.title
                : localize('AWS.wizard.location.prompt', 'Select a workspace folder for your project'),
            step: additionalParams?.step,
            totalSteps: additionalParams?.totalSteps,
        },
        items: items,
        buttons: [
            ...(additionalParams?.helpButton ? [additionalParams.helpButton.button] : []),
            vscode.QuickInputButtons.Back,
        ],
    })

    const choices = await picker.promptUser({
        picker: quickPick,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve(undefined)
            } else if (button === additionalParams?.helpButton?.button) {
                void openUrl(vscode.Uri.parse(additionalParams.helpButton.url))
            }
        },
    })
    const pickerResponse = picker.verifySinglePickerOutput<FolderQuickPickItem>(choices)

    if (!pickerResponse) {
        return undefined
    }

    if (pickerResponse instanceof BrowseFolderQuickPickItem) {
        const browseFolderResult = await pickerResponse.getUri()

        // If user cancels from Open Folder dialog, send them back to the folder picker.
        return browseFolderResult ? browseFolderResult : await promptUserForLocation(context, additionalParams)
    }

    return pickerResponse.getUri()
}
