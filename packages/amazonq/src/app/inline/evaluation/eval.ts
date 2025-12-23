/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
// import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports
import { SessionManager } from '../sessionManager'
import { getLogger } from 'aws-core-vscode/shared'

type InputEntry = {
    fileToTriggerInline: string
    line: number
    column: number
}

export class EvaluationProcess {
    private rawInput: string = ''
    private inputEntries: InputEntry[]

    constructor(
        inputpath: string,
        readonly sessionManager: SessionManager | undefined
    ) {
        // this.rawInput = nodefs.readFileSync(inputpath, 'utf-8')
        // this.inputEntries = this.processRawinput(this.rawInput)
        this.inputEntries = [
            {
                fileToTriggerInline: 'MathUtil.java',
                line: 11,
                column: 0,
            },
        ]
    }

    /**
     * @param rawInput JSONL file
     * @returns InputEntry[]
     */
    processRawinput(rawInput: string): InputEntry[] {
        const lines = rawInput.split('\n')
        const inputEntries: InputEntry[] = []

        for (const line of lines) {
            // TODO: try...catch
            const obj = JSON.parse(line)
            // TODO: implement the actual parsing logic
            const inputEntry: InputEntry = {
                fileToTriggerInline: obj.fileToTriggerInline,
                line: obj.line,
                column: obj.column,
            }
            inputEntries.push(inputEntry)
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

    async triggerInlineOnce(inputEntry: InputEntry) {
        const { fileToTriggerInline, line, column } = inputEntry
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
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
    }

    async searchFile(filename: string): Promise<vscode.Uri | undefined> {
        const files = await vscode.workspace.findFiles(`**/${filename}`)
        if (files.length === 0) {
            getLogger().error(`file ${filename} not found`)
            return undefined
        }

        return files[0]
    }
}
