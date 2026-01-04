/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports
import { SessionManager } from '../sessionManager'
import { getLogger } from 'aws-core-vscode/shared'
import { InlineCompletionManager } from '../completion'
import { InlineCompletionTriggerKind } from 'vscode-languageclient'

type InputEntry = {
    filename: string
    filepath: string
    line: number
    column: number
}

export class EvaluationProcess {
    private rawInput: string = ''
    private inputEntries: InputEntry[]
    private tokenSrc: vscode.CancellationTokenSource = new vscode.CancellationTokenSource()

    constructor(
        inputpath: string,
        readonly sessionManager: SessionManager | undefined,
        readonly inlineMananger: InlineCompletionManager
    ) {
        this.rawInput = nodefs.readFileSync(inputpath, 'utf-8')
        this.inputEntries = this.processRawinput(this.rawInput)
    }

    /**
     * @param rawInput JSONL file
     * @returns InputEntry[]
     */
    private processRawinput(rawInput: string): InputEntry[] {
        const lines = rawInput.trim().split('\n')
        const inputEntries: InputEntry[] = []

        try {
            for (const line of lines) {
                if (!line.length) {
                    continue
                }
                const obj = JSON.parse(line)
                // TODO: implement the actual parsing logic
                const inputEntry: InputEntry = {
                    filename: obj.file_name,
                    filepath: obj.file_path,
                    line: obj.method_body_start_point[0],
                    column: obj.method_body_start_point[1],
                }
                inputEntries.push(inputEntry)
            }
        } catch (e) {
            getLogger().error(`Error parsing input: ${e}`)
            throw e
        }

        return inputEntries
    }

    async run(): Promise<void> {
        for (const inputEntry of this.inputEntries) {
            await this.triggerInlineOnce(inputEntry)
            const suggetions = this.sessionManager?.getActiveSession()?.suggestions
            // TODO: write to a file
            getLogger().info(`recieved ${suggetions?.length ?? 0} suggestions`)
        }
        return
    }

    private async triggerInlineOnce(inputEntry: InputEntry) {
        const { filename: fileToTriggerInline, line, column } = inputEntry
        const uri = await this.searchFile(fileToTriggerInline)
        if (!uri) {
            return
        }

        // open the file in vscode editor
        const document = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(document)
        // move the cursor to line and column
        editor.selection = new vscode.Selection(line, column, line, column)

        // or 'aws.amazonq.invokeInlineCompletion'
        // await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
        await this.inlineMananger.getInlineCompletionProvider().provideInlineCompletionItems(
            document,
            editor.selection.active,
            {
                triggerKind: InlineCompletionTriggerKind.Automatic,
                selectedCompletionInfo: undefined,
            },
            this.tokenSrc.token
        )
    }

    private async searchFile(filename: string): Promise<vscode.Uri | undefined> {
        const files = await vscode.workspace.findFiles(`**/${filename}`)
        if (files.length === 0) {
            getLogger().error(`file ${filename} not found`)
            return undefined
        }

        return files[0]
    }
}
