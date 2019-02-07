/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as immutable from 'immutable'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { SamCliInitArgs } from '../../shared/sam/cli/samCliInit'
import * as lambdaRuntime from '../models/samLambdaRuntime'
import { MultiStepWizard, WizardStep } from '../wizards/multiStepWizard'

export interface CreateNewSamAppWizardContext {
    readonly lambdaRuntimes: immutable.Set<lambdaRuntime.SamLambdaRuntime>
    readonly workspaceFolders: vscode.WorkspaceFolder[] | undefined

    showInputBox(
        options?: vscode.InputBoxOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined>

    showOpenDialog(
        options: vscode.OpenDialogOptions
    ): Thenable<vscode.Uri[] | undefined>

    showQuickPick(
        items: string[] | Thenable<string[]>,
        options: vscode.QuickPickOptions & { canPickMany: true },
        token?: vscode.CancellationToken
    ): Thenable<string[] | undefined>
    showQuickPick(
        items: string[] | Thenable<string[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<string | undefined>
    showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options: vscode.QuickPickOptions & { canPickMany: true },
        token?: vscode.CancellationToken
    ): Thenable<T[] | undefined>
    showQuickPick<T extends vscode.QuickPickItem>(
        items: T[] | Thenable<T[]>,
        options?: vscode.QuickPickOptions,
        token?: vscode.CancellationToken
    ): Thenable<T | undefined>
}

class DefaultCreateNewSamAppWizardContext implements CreateNewSamAppWizardContext {
    public readonly lambdaRuntimes = lambdaRuntime.samLambdaRuntimes
    public readonly showInputBox = vscode.window.showInputBox
    public readonly showOpenDialog = vscode.window.showOpenDialog
    public readonly showQuickPick = vscode.window.showQuickPick

    public get workspaceFolders(): vscode.WorkspaceFolder[] | undefined {
        return vscode.workspace.workspaceFolders
    }
}

export class CreateNewSamAppWizard extends MultiStepWizard<SamCliInitArgs> {
    private runtime?: lambdaRuntime.SamLambdaRuntime
    private location?: vscode.Uri
    private name?: string

    public constructor(
        private readonly context: CreateNewSamAppWizardContext = new DefaultCreateNewSamAppWizardContext()
    ) {
        super()
    }

    protected get startStep() {
        return this.RUNTIME
    }

    protected getResult(): SamCliInitArgs | undefined {
        if (!this.runtime || !this.location || !this.name) {
            return undefined
        }

        return {
            runtime: this.runtime,
            location: this.location,
            name: this.name
        }
    }

    private readonly RUNTIME: WizardStep = async () => {
        const runtimeItems = this.context.lambdaRuntimes
            .toArray()
            .sort()
            .map(runtime => ({ label: runtime }))

        const result = await this.context.showQuickPick<vscode.QuickPickItem>(runtimeItems, {
            ignoreFocusOut: true
        })

        if (!result) {
            return undefined
        }

        this.runtime = result.label as lambdaRuntime.SamLambdaRuntime

        return this.LOCATION
    }

    private readonly LOCATION: WizardStep = async () => {
        const choices: FolderQuickPickItem[] = (this.context.workspaceFolders || [])
            .map<FolderQuickPickItem>(f => new WorkspaceFolderQuickPickItem(f) )
            .concat([ new BrowseFolderQuickPickItem(this.context) ])

        const selection = await this.context.showQuickPick(choices, {
            ignoreFocusOut: true,
        })
        if (!selection) {
            return this.RUNTIME
        }
        this.location = await selection.getUri()

        return this.location ? this.NAME : this.RUNTIME
    }

    private readonly NAME: WizardStep = async () => {
        this.name = await this.context.showInputBox({
            value: 'my-sam-app',
            prompt: localize(
                'AWS.samcli.initWizard.name.prompt',
                'Choose a name for your new application'
            ),
            placeHolder: localize(
                'AWS.samcli.initWizard.name.placeholder',
                'application name'
            ),
            ignoreFocusOut: true,

            validateInput(value: string): string | undefined | null | Thenable<string | undefined | null> {
                if (!value) {
                    return localize(
                        'AWS.samcli.initWizard.name.error.empty',
                        'Application name cannot be empty'
                    )
                }

                if (value.includes(path.sep)) {
                    return localize(
                        'AWS.samcli.initWizard.name.error.pathSep',
                        'The path separator ({0}) is not allowed in application names',
                        path.sep
                    )
                }

                return undefined
            }
        })

        return this.name ? undefined : this.LOCATION
    }
}

export interface FolderQuickPickItem extends vscode.QuickPickItem {
    getUri(): Thenable<vscode.Uri | undefined>
}

class WorkspaceFolderQuickPickItem implements FolderQuickPickItem {
    public readonly label: string

    public constructor(private readonly folder: vscode.WorkspaceFolder) {
        this.label = folder.name
    }

    public async getUri(): Promise<vscode.Uri | undefined> {
        return this.folder.uri
    }
}

class BrowseFolderQuickPickItem implements FolderQuickPickItem {
    public readonly label = localize(
        'AWS.samcli.initWizard.name.browse.label',
        'Browse...'
    )

    public constructor(
        private readonly context: CreateNewSamAppWizardContext
    ) {
    }

    public async getUri(): Promise<vscode.Uri | undefined> {
        const workspaceFolders = this.context.workspaceFolders
        const defaultUri = !!workspaceFolders && workspaceFolders.length > 0 ?
            workspaceFolders[0].uri :
            vscode.Uri.file(os.homedir())

        const result = await this.context.showOpenDialog({
            defaultUri,
            openLabel: localize(
                'AWS.samcli.initWizard.name.browse.openLabel',
                'Open'
            ),
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        })

        if (!result || !result.length) {
            return undefined
        }

        return result[0]
    }
}
