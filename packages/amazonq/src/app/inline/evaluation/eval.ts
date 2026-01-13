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
import { extractContextForCodeWhisperer } from 'aws-core-vscode/codewhisperer'
import assert from 'assert'
// import { get } from 'http'

type InputEntry = {
    packageName: string
    filename: string
    filepath: string
    leftContext: string
    rightContext: string
    groundTruth: string
    line: number
    column: number
}

export class EvaluationProcess {
    private rawInput: string = ''
    private inputEntries: InputEntry[]
    private tokenSrc: vscode.CancellationTokenSource = new vscode.CancellationTokenSource()
    private log = getLogger('inline')

    constructor(
        readonly sessionManager: SessionManager | undefined,
        readonly inlineMananger: InlineCompletionManager,
        inputpath: string = '/Users/xshaohua/workplace/ide/dev-scripts/inline_investigation_scripts/apex_sample_10.jsonl'
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
                const inputEntry: InputEntry = {
                    packageName: obj.package_name,
                    filename: obj.file_name,
                    filepath: obj.file_path,
                    leftContext: obj.left_context,
                    rightContext: obj.right_context,
                    groundTruth: obj.ground_truth_method_body,
                    line: obj.method_body_start_point[0],
                    column: obj.method_body_start_point[1],
                }
                inputEntries.push(inputEntry)
            }
        } catch (e) {
            this.log.error(`Error parsing input: ${e}`)
            throw e
        }

        this.log.info(`Found ${lines.length} input entries for simulation`)
        return inputEntries
    }

    async run(): Promise<void> {
        let reportString = 'REPORT\n'
        for (let i = 0; i < this.inputEntries.length; i++) {
            const inputEntry = this.inputEntries[i]
            try {
                await this.triggerInlineOnce(inputEntry)
                const suggetions = this.sessionManager?.getActiveSession()?.suggestions
                // use edit distance to compare inputEntry.groundTruth vs. suggestions[0]

                // TODO: write to a file
                this.log.info(`Finished running ${i}th and recieved ${suggetions?.length ?? 0} suggestions`)
                reportString += `\t${i}th succeeded: filename=${inputEntry.filename}; suggestionCnt=${suggetions?.length ?? 0}\n`
            } catch (e) {
                this.log.error(`Error triggering inline ${i}th: ${e}`)
                reportString += `\t${i}th faled: filename=${inputEntry.filename}; error=${e}\n`
            }
        }

        this.log.info(reportString)
        return
    }

    private async triggerInlineOnce(inputEntry: InputEntry) {
        // const { filename: fileToTriggerInline, line, column } = inputEntry

        const uri = await this.searchFile(inputEntry.filename, inputEntry.packageName)
        if (!uri) {
            return
        }

        // open the file in vscode editor
        const document = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(document)
        // move the cursor to line and column
        editor.selection = new vscode.Selection(inputEntry.line, inputEntry.column, inputEntry.line, inputEntry.column)

        const f = await waitUntil(
            async () => {
                const e = vscode.window.activeTextEditor
                return (
                    e &&
                    e.document.uri.fsPath === uri.fsPath &&
                    e.selection.anchor.line === inputEntry.line &&
                    e.selection.anchor.character === inputEntry.column
                )
            },
            { retryOnFail: true, timeout: 10000, interval: 1000 }
        )

        // assertion to confirm file & cursor etc are correct
        const ctx = extractContextForCodeWhisperer(editor)
        assert.strictEqual(ctx.leftFileContent, inputEntry.leftContext)
        // TODO: it seems right context field is kinda weird
        // assert.strictEqual(ctx.rightFileContent, inputEntry.rightContext)
        // assert.strictEqual(ctx.filename, inputEntry.filename)

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
actual filename: ${inputEntry.filename}
actual suggestion: ${actualSuggestions}
ground truth: ${groundTruth}
editSimAvg: ${compareResult.editSimAvg}
emRatio: ${compareResult.emRatio}`

                this.log.info(logstr)
            } catch (e) {
                const logstr = `@@response analysis@@
actual filename: ${inputEntry.filename}
length doesnt match
actual suggestion is empty: ${this.sessionManager?.getActiveRecommendation().length}
ground truth: ${inputEntry.groundTruth}`
                this.log.error((e as Error).message)
                this.log.info(logstr)

                throw e
            }
        } else {
            this.log.error(`failed to move cursor to ${inputEntry.line}, ${inputEntry.column}`)
        }

        // close the editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }

    private async searchFile(filename: string, packageName: string): Promise<vscode.Uri | undefined> {
        const files = await vscode.workspace.findFiles(`**/${filename}`)
        if (files.length === 0) {
            this.log.error(`file ${filename} not found`)
            return undefined
        }

        return files.find((f) => f.fsPath.includes(packageName))
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
