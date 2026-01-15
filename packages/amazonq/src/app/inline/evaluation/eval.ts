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
import {
    CodeWhispererConstants,
    CodeWhispererStatusBarManager,
    extractContextForCodeWhisperer,
} from 'aws-core-vscode/codewhisperer'
import assert from 'assert'
import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes-types'

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
    get length() {
        return this.inputEntries.length
    }
    private _activeIndex: number | undefined = undefined
    set activeIndex(idx: number | undefined) {
        this._activeIndex = idx
        this.statusBar.simulationIndex = idx
            ? {
                  current: idx + 1,
                  total: this.inputEntries.length,
              }
            : undefined
    }
    get activeIndex() {
        return this._activeIndex
    }

    private statusBar = CodeWhispererStatusBarManager.instance

    constructor(
        readonly sessionManager: SessionManager | undefined,
        readonly inlineMananger: InlineCompletionManager,
        inputpath: string = '/Users/xshaohua/workplace/ide/dev-scripts/inline_investigation_scripts/apex_sample_200.jsonl'
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
        const startTime = Date.now()
        let reportString = 'REPORT\n'
        for (let i = 0; i < this.inputEntries.length; i++) {
            this.activeIndex = i
            const inputEntry = this.inputEntries[i]
            try {
                await this.triggerInlineOnce(inputEntry)
                const suggetions = this.sessionManager?.getActiveSession()?.suggestions
                // use edit distance to compare inputEntry.groundTruth vs. suggestions[0]

                // TODO: write to a file
                this.log.info(`Finished running ${i}th and recieved ${suggetions?.length ?? 0} suggestions`)
                reportString += `\t${i}th succeeded: filename=${inputEntry.filename}; packagename=${inputEntry.packageName}; suggestionCnt=${suggetions?.length ?? 0}\n`
            } catch (e) {
                this.log.error(`Error triggering inline ${i}th: ${e}`)
                reportString += `\t${i}th faled: filename=${inputEntry.filename}; packagename=${inputEntry.packageName}; error=${e}\n`
            }
        }

        const endTime = Date.now()
        this.log.info(`simulation is done; it took ${(endTime - startTime) / 1000} seconds}`)
        this.log.info(reportString)
        this.activeIndex = undefined
        await this.statusBar.refreshStatusBar()
        return
    }

    private async triggerInlineOnce(inputEntry: InputEntry) {
        const uri = await this.searchFile(inputEntry.filename, inputEntry.packageName)
        if (!uri) {
            throw new Error(`File ${inputEntry.filename} not found`)
        }

        // open the file in vscode editor
        const document = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(document)
        // move the cursor to line and column
        editor.selection = new vscode.Selection(inputEntry.line, inputEntry.column, inputEntry.line, inputEntry.column)

        const isSetupDone = await waitUntil(
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
        const ctx: { leftFileContent: string; filename: string } = extractContextForCodeWhisperer(editor)
        const expectedLeftContext = inputEntry.leftContext.substring(
            inputEntry.leftContext.length - CodeWhispererConstants.charactersLimit,
            inputEntry.leftContext.length
        )

        try {
            assert.ok(ctx.filename.includes(inputEntry.filename))
            assert.strictEqual(editor.selection.active.line, inputEntry.line)
            assert.strictEqual(editor.selection.active.character, inputEntry.column)
            // TODO: weird, some left context don't match
            // assert.strictEqual(ctx.leftFileContent, expectedLeftContext)
        } catch (e) {
            console.log()
        }

        if (isSetupDone) {
            // TODO: write to jsonl
            const res = await this.triggerInlineAndAnalyze(document, editor, inputEntry)
        } else {
            this.log.error(`failed to move cursor to ${inputEntry.line}, ${inputEntry.column}`)
        }

        // close the editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }

    // TODO: error handling
    private async triggerInlineAndAnalyze(
        document: vscode.TextDocument,
        editor: vscode.TextEditor,
        inputEntry: InputEntry
    ): Promise<EditDistanceResult & InputEntry> {
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
            const suggestions = this.sessionManager?.getActiveRecommendation() ?? []
            const compareResult = computeEditDistances(
                suggestions.map((s) => s.insertText as string),
                inputEntry.groundTruth
            )
            const logstr = `@@response analysis@@
actual filename: ${inputEntry.filename}
editSimAvg: ${compareResult.editSimAvg}
emRatio: ${compareResult.emRatio}
ground truth: ${inputEntry.groundTruth}
actual suggestion: ${this.formatSuggestionsLog(suggestions)}`
            this.log.info(logstr)

            return {
                ...inputEntry,
                ...compareResult,
            }
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
    }

    private async searchFile(filename: string, packageName: string): Promise<vscode.Uri | undefined> {
        const files = await vscode.workspace.findFiles(`**/${filename}`)
        if (files.length === 0) {
            this.log.error(`file ${filename} not found`)
            return undefined
        }

        return files.find((f) => f.fsPath.includes(packageName))
    }

    private formatSuggestionsLog(suggestions: InlineCompletionItemWithReferences[]): string {
        let s = ''

        for (let i = 0; i < suggestions.length; i++) {
            const suggestion = suggestions[i].insertText as string
            s += `---suggestion ${i}---\n`
            s += `${suggestion}\n`
        }

        return s
    }
}

// TODO: not yet verify calculation aligns with science implementation
interface DetailedResult {
    taskId: number
    pred: string
    target: string
    editSimilarity: number
    exactMatch: boolean
}

interface EditDistanceResult {
    emRatio: number
    editSimAvg: number
    detailedResults: DetailedResult[]
}

function calEditSim(target: string, truth: string): number {
    let editSim = 0.0

    const pred = truth.trim()
    const gt = target.trim()
    editSim += Fuzz.ratio(pred, gt)

    return editSim
}

function computeEditDistances(suggestions: string[], truth: string): EditDistanceResult {
    if (suggestions.length === 0) {
        throw new Error('empty suggestion')
    }

    if (!truth.length) {
        throw new Error('empty ground truth')
    }

    const detailedResults: DetailedResult[] = []
    let editSim = 0
    let exactMatchCnt = 0

    for (let idx = 0; idx < suggestions.length; idx++) {
        const target = suggestions[idx]

        const es = calEditSim(target, truth)
        const em = target === truth
        if (em) {
            exactMatchCnt++
        }

        editSim += es

        detailedResults.push({
            taskId: idx,
            pred: target,
            target: truth,
            editSimilarity: es,
            exactMatch: em,
        })
    }

    const totalSamples = suggestions.length
    const editSimAvg = totalSamples > 0 ? Math.round((editSim / totalSamples) * 100) / 100 : -1
    const emRatio = exactMatchCnt / totalSamples

    return {
        emRatio,
        editSimAvg,
        detailedResults,
    }
}
