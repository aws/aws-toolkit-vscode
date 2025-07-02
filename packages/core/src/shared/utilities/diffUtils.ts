/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import vscode from 'vscode'
import path from 'path'
import { applyPatch, parsePatch, type LinesOptions, diffLines, Change } from 'diff'
import { tempDirPath } from '../filesystemUtilities'
import fs from '../fs/fs'
import { amazonQDiffScheme } from '../constants'
import { ContentProvider } from '../../amazonq/commons/controllers/contentController'
import { disposeOnEditorClose } from './editorUtilities'
import { getLogger } from '../logger/logger'
import jaroWinkler from 'jaro-winkler'

/**
 * Get the patched code from a file and a patch.
 * If snippetMode is true, it will return the code snippet that was changed.
 * Otherwise, it will return the entire file with the changes applied.
 *
 * @param filePath The file being patched
 * @param patch The patch to apply
 * @param snippetMode Whether to return a snippet or the entire code
 * @returns The patched code
 */
export async function getPatchedCode(filePath: string, patch: string, snippetMode = false) {
    const document = await vscode.workspace.openTextDocument(filePath)
    const fileContent = document.getText()
    // Usage with the existing getPatchedCode function:

    let updatedPatch = patch
    let updatedContent = applyPatch(fileContent, updatedPatch, { fuzzFactor: 4 })
    if (!updatedContent) {
        updatedPatch = updatePatchLineNumbers(patch, 1)
        updatedContent = applyPatch(fileContent, updatedPatch, { fuzzFactor: 4 })
        if (!updatedContent) {
            return ''
        }
    }

    if (!snippetMode) {
        return updatedContent
    }

    const [parsedDiff] = parsePatch(updatedPatch)
    const { lines, oldStart } = parsedDiff.hunks[0]
    const deletionLines = lines.filter((line) => line.startsWith('-'))
    const startLine = oldStart - 1
    const endLine = startLine + lines.length - deletionLines.length
    return updatedContent.split('\n').slice(startLine, endLine).join('\n')
}

function updatePatchLineNumbers(patch: string, offset: number): string {
    // Regular expression to match the @@ line with capturing groups for the numbers
    const lineNumberRegex = /@@ -(\d+),(\d+) \+(\d+),(\d+) @@/g
    return patch.replace(
        lineNumberRegex,
        (match: string, oldStart: string, oldCount: string, newStart: string, newCount: string) => {
            // Convert to numbers and adjust by offset
            const adjustedOldStart = Math.max(1, parseInt(oldStart) + offset)
            const adjustedNewStart = Math.max(1, parseInt(newStart) + offset)

            // Create new @@ line with adjusted numbers
            return `@@ -${adjustedOldStart},${oldCount} +${adjustedNewStart},${newCount} @@`
        }
    )
}

/**
 * Preview the diff of a file with a patch in vscode native diff view.
 * Creates a temporary file with the patched code to do the comparison.
 *
 * @param filePath The file being patched
 * @param patch The patch to apply
 * @returns
 */
export async function previewDiff(filePath: string, patch: string) {
    const patchedCode = await getPatchedCode(filePath, patch)
    const file = path.parse(filePath)
    const tmpFilePath = path.join(tempDirPath, `${file.name}_proposed-${Date.now()}${file.ext}`)
    const tmpFileUri = vscode.Uri.parse(`${amazonQDiffScheme}:${tmpFilePath}`)

    await fs.writeFile(tmpFilePath, patchedCode)
    const contentProvider = new ContentProvider(tmpFileUri)
    const disposable = vscode.workspace.registerTextDocumentContentProvider(amazonQDiffScheme, contentProvider)

    await vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.file(filePath),
        tmpFileUri,
        getDiffTitle(file.base),
        <vscode.TextDocumentShowOptions>{ preview: true, viewColumn: vscode.ViewColumn.One }
    )

    disposeOnEditorClose(tmpFileUri, disposable)
    await fs.delete(tmpFilePath)
}

export async function closeDiff(filePath: string) {
    vscode.window.tabGroups.all.flatMap(({ tabs }) =>
        tabs.map((tab) => {
            if (tab.label === getDiffTitle(path.basename(filePath))) {
                const tabClosed = vscode.window.tabGroups.close(tab)
                if (!tabClosed) {
                    getLogger().error('Unable to close the diff view tab for %s', tab.label)
                }
            }
        })
    )
}

function getDiffTitle(fileName: string) {
    return `${fileName}: Original ↔ ${fileName}`
}

/**
 * Calculates the number of added characters and lines between existing content and LLM response
 *
 * @param existingContent The original text content before changes
 * @param llmResponse The new text content from the LLM
 * @returns An object containing:
 *          - addedChars: Total number of new characters added
 *          - addedLines: Total number of new lines added
 *
 */
export function getDiffCharsAndLines(
    existingContent: string,
    llmResponse: string
): {
    addedChars: number
    addedLines: number
} {
    let addedChars = 0
    let addedLines = 0
    const diffs = diffLines(existingContent, llmResponse, {
        stripTrailingCr: true,
        ignoreNewlineAtEof: true,
    } as LinesOptions)

    // eslint-disable-next-line unicorn/no-array-for-each
    diffs.forEach((part: Change) => {
        if (part.added) {
            addedChars += part.value.length
            addedLines += part.count ?? part.value.split('\n').length
        }
    })

    return {
        addedChars,
        addedLines,
    }
}

/**
 * Extracts modified lines from a unified diff string.
 * @param unifiedDiff The unified diff patch as a string.
 * @returns A Map where keys are removed lines and values are the corresponding modified (added) lines.
 */
export function getModifiedLinesFromUnifiedDiff(unifiedDiff: string): Map<string, string> {
    const removedLines: string[] = []
    const addedLines: string[] = []

    // Parse the unified diff to extract removed and added lines
    const lines = unifiedDiff.split('\n')
    for (const line of lines) {
        if (line.startsWith('-') && !line.startsWith('---')) {
            removedLines.push(line.slice(1))
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
            addedLines.push(line.slice(1))
        }
    }

    const modifiedMap = new Map<string, string>()
    let addedIndex = 0

    // For each removed line, find the most similar added line
    for (const removedLine of removedLines) {
        let bestMatchIndex = -1

        for (let i = addedIndex; i < addedLines.length; i++) {
            const addedLine = addedLines[i]
            const score = jaroWinkler(removedLine, addedLine)
            if (score > 0.5) {
                bestMatchIndex = i
                break
            }
        }

        if (bestMatchIndex !== -1) {
            // Map the removed line to the most similar added line
            modifiedMap.set(removedLine, addedLines[bestMatchIndex])
            // Move addedIndex to the next line after the match
            addedIndex = bestMatchIndex + 1
        } else {
            // No match found for this removed line, move on
            continue
        }
    }

    return modifiedMap
}
