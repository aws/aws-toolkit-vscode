/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports
import { SessionManager } from '../sessionManager'
import { getLogger, waitUntil } from 'aws-core-vscode/shared'
import { InlineCompletionManager } from '../completion'
import { InlineCompletionTriggerKind } from 'vscode-languageclient'
import Fuzz from 'fuzzball'
// import { get } from 'http'

type InputEntry = {
    filename: string
    filepath: string
    groundTruth: string
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
                    groundTruth: obj.ground_truth_method_body,
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
            try {
                await this.triggerInlineOnce(inputEntry)
                const suggetions = this.sessionManager?.getActiveSession()?.suggestions
                // use edit distance to compare inputEntry.groundTruth vs. suggestions[0]

                // TODO: write to a file
                getLogger().info(`recieved ${suggetions?.length ?? 0} suggestions`)
            } catch (e) {
                getLogger().error(`Error triggering inline: ${e}`)
            }
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
        const f = await waitUntil(
            async () => {
                const e = vscode.window.activeTextEditor
                return (
                    e &&
                    e.document.uri.fsPath === uri.fsPath &&
                    e.selection.anchor.line === line &&
                    e.selection.anchor.character === column
                )
            },
            { retryOnFail: true, timeout: 10000, interval: 1000 }
        )

        if (f) {
            // call inline api to get suggestions in states
            await this.inlineMananger.runEvalFlow(
                document,
                editor.selection.active,
                {
                    triggerKind: InlineCompletionTriggerKind.Automatic,
                    selectedCompletionInfo: undefined,
                },
                this.tokenSrc.token
            )

            // compare with ground truth
            try {
                const firstSuggestion = this.sessionManager?.getActiveRecommendation()[0]
                const actualSuggestions = firstSuggestion ? ([firstSuggestion.insertText] as string[]) : []
                const groundTruth = [inputEntry.groundTruth]
                const compareResult = computeEditDistances(actualSuggestions, groundTruth)
                const logstr = `@@response analysis@@
actual suggestion: ${actualSuggestions}
ground truth: ${groundTruth}
editSimAvg: ${compareResult.editSimAvg}
emRatio: ${compareResult.emRatio}`

                getLogger().info(logstr)
            } catch (e) {
                const logstr = `@@response analysis@@
length doesnt match
actual suggestion is empty: ${this.sessionManager?.getActiveRecommendation().length}
ground truth: ${inputEntry.groundTruth}`
                getLogger().error((e as Error).message)
                getLogger().info(logstr)
            }
        } else {
            getLogger().error(`failed to move cursor to ${line}, ${column}`)
        }
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

// TODO: not yet verify calculation aligns with science implementation
interface DetailedResult {
    taskId: number
    pred: string
    target: string
    em: number
    es: number
}

interface ComputeResult {
    emRatio: number
    editSimAvg: number
    detailedResults: DetailedResult[]
}

function calEditSim(references: string[], hypotheses: string[]): number {
    const total = references.length
    let editSim = 0.0

    for (let i = 0; i < references.length; i++) {
        const pred = hypotheses[i].trim()
        const gt = references[i].trim()
        editSim += Fuzz.ratio(pred, gt)
    }

    return editSim / total
}

function tokenizeCode(code: string): string[] {
    // Replace non-alphanumeric characters with spaces
    code = code.replace(/([^A-Za-z0-9_])/g, ' $1 ')
    // Add space between lowercase and uppercase letters
    code = code.replace(/([a-z])([A-Z])/g, '$1 $2')
    // Replace multiple spaces with single space
    code = code.replace(/\s+/g, ' ')
    // Replace quotes with backticks
    code = code.replace(/"/g, '`')
    code = code.replace(/'/g, '`')
    // Split and filter empty strings
    const tokens = code.split(' ').filter((t) => t.length > 0)

    return tokens
}

function calExactMatch(references: string[], hypotheses: string[]): number {
    const emScores: number[] = []

    for (let i = 0; i < references.length; i++) {
        const predTokens = tokenizeCode(hypotheses[i])
        const goldTokens = tokenizeCode(references[i])

        const isMatch = JSON.stringify(predTokens) === JSON.stringify(goldTokens)
        emScores.push(isMatch ? 1 : 0)
    }

    return emScores.reduce((a, b) => a + b, 0) / emScores.length
}

function computeEditDistances(targets: string[], predictions: string[]): ComputeResult {
    if (targets.length !== predictions.length) {
        throw new Error('Targets and predictions must have the same length')
    }

    const detailedResults: DetailedResult[] = []
    let exactMatch = 0
    let editSim = 0

    for (let idx = 0; idx < targets.length; idx++) {
        const target = targets[idx]
        const prediction = predictions[idx]

        const es = calEditSim([target], [prediction])
        const em = calExactMatch([target], [prediction])

        editSim += es
        exactMatch += em

        detailedResults.push({
            taskId: idx,
            pred: prediction,
            target: target,
            em: em,
            es: es,
        })
    }

    const totalSamples = targets.length
    const emRatio = totalSamples > 0 ? Math.round((exactMatch / totalSamples) * 100 * 100) / 100 : -1
    const editSimAvg = totalSamples > 0 ? Math.round((editSim / totalSamples) * 100) / 100 : -1

    return {
        emRatio,
        editSimAvg,
        detailedResults,
    }
}
