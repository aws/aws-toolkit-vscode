/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { createInputBox, promptUser } from '../ui/input'
import { CloudFormation } from './cloudformation'

/**
 * Prompts user for a CloudFormation Stack name.
 * User is prevented from entering in known existing Stack names.
 */
export class CloudFormationStackPrompt {
    public static readonly PROMPT_CANCELLED: string = 'CloudFormationStackPrompt.Cancelled'

    private readonly existingStackNames: string[]
    private _inputBox: vscode.InputBox | undefined

    public constructor(existingStackNames: string[]) {
        this.existingStackNames = existingStackNames
    }

    public async prompt(): Promise<string> {
        const response = await promptUser({
            inputBox: this.inputBox,
            onValidateInput: text => this.validateInput(text),
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    this.inputBox.hide()
                    resolve(CloudFormationStackPrompt.PROMPT_CANCELLED)
                }
            }
        })

        return response || CloudFormationStackPrompt.PROMPT_CANCELLED
    }

    protected createInputBox(): vscode.InputBox {
        return createInputBox(
            {
                options: {
                    ignoreFocusOut: true,
                    title: localize(
                        'AWS.samcli.deploy.stackName.prompt',
                        'Enter the name to use for the deployed stack'
                    )
                },
                buttons: [
                    vscode.QuickInputButtons.Back,
                ]
            }
        )
    }

    private get inputBox(): vscode.InputBox {
        if (!this._inputBox) {
            this._inputBox = this.createInputBox()
        }

        return this._inputBox
    }

    private validateInput(text: string): string | undefined {
        if (this.existingStackNames.indexOf(text) !== -1) {
            return `Stack exists: ${text}`
        }

        return CloudFormation.validateStackName(text)
    }
}
