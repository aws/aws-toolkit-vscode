/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CommandDeclarations, Commands } from '../../shared/vscode/commands2'
import { showCodeWhispererWebview, CodeWhispererSource } from '../vue/backend'
import { telemetry } from '../../shared/telemetry/telemetry'
/**
 * The methods with backend logic for the Codewhisperer Getting Started Page commands.
 */
export class CodeWhispererCommandBackend {
    constructor(private readonly extContext: vscode.ExtensionContext, private start: string) {}
    public showGettingStartedPage(source: CodeWhispererSource) {
        telemetry.ui_click.emit({ elementId: 'codewhisperer_Learn_ButtonClick' })
        return showCodeWhispererWebview(this.extContext, source, this.start)
    }
}
/**
 * Declared commands related to CodeWhisperer in the toolkit.
 */
export class CodeWhispererCommandDeclarations implements CommandDeclarations<CodeWhispererCommandBackend> {
    static #instance: CodeWhispererCommandDeclarations

    static get instance(): CodeWhispererCommandDeclarations {
        return (this.#instance ??= new CodeWhispererCommandDeclarations())
    }
    public readonly declared = {
        showGettingStartedPage: Commands.from(CodeWhispererCommandBackend).declareShowGettingStartedPage(
            'aws.codeWhisperer.gettingStarted'
        ),
    } as const
}
