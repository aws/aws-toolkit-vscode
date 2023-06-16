/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import { DependencyGraph } from '../dependencyGraph/dependencyGraph'
import { BM25Document, BM25Okapi } from './rankBm25'
import { isRelevant } from './editorFilesUtil'
import { ToolkitError } from '../../../shared/errors'
import { crossFileContextConfig, supplemetalContextFetchingTimeoutMsg } from '../../models/constants'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { CodeWhispererSupplementalContextItem } from './supplementalContextUtil'

const crossFileLanguageConfigs = ['java']
interface Chunk {
    fileName: string
    content: string
    nextContent: string
    score?: number
}

export async function fetchSupplementalContextForSrc(
    editor: vscode.TextEditor,
    dependencyGraph: DependencyGraph,
    cancellationToken: vscode.CancellationToken
): Promise<CodeWhispererSupplementalContextItem[] | undefined> {
    if (crossFileLanguageConfigs.includes(editor.document.languageId) === false) {
        return undefined
    }

    // Step 1: Get relevant cross files to refer
    const relevantCrossFilePaths = await getRelevantCrossFiles(editor, dependencyGraph)
    throwIfCancelled(cancellationToken)
    // Step 2: Split files to chunks with upper bound on chunkCount
    // We restrict the total number of chunks to improve on latency.
    // Chunk linking is required as we want to pass the next chunk value for matched chunk.
    let chunkList: Chunk[] = []
    for (const relevantFile of relevantCrossFilePaths) {
        throwIfCancelled(cancellationToken)
        const chunks: Chunk[] = splitFileToChunks(relevantFile, crossFileContextConfig.numberOfLinesEachChunk)
        const linkedChunks = linkChunks(chunks)
        chunkList.push(...linkedChunks)
        if (chunkList.length >= crossFileContextConfig.numberOfChunkToFetch) {
            break
        }
    }

    // it's required since chunkList.push(...) is likely giving us a list of size > 60
    chunkList = chunkList.slice(0, crossFileContextConfig.numberOfChunkToFetch)

    // Step 3: Generate Input chunk (10 lines left of cursor position)
    // and Find Best K chunks w.r.t input chunk using BM25
    const inputChunk: Chunk = getInputChunk(editor, crossFileContextConfig.numberOfLinesEachChunk)
    const bestChunks: Chunk[] = findBestKChunkMatches(inputChunk, chunkList, crossFileContextConfig.topK)
    throwIfCancelled(cancellationToken)

    // Step 4: Transform best chunks to supplemental contexts
    const supplementalContexts: CodeWhispererSupplementalContextItem[] = []
    for (const chunk of bestChunks) {
        throwIfCancelled(cancellationToken)

        supplementalContexts.push({
            filePath: chunk.fileName,
            content: chunk.nextContent,
            score: chunk.score,
        })
    }

    return supplementalContexts
}

function findBestKChunkMatches(chunkInput: Chunk, chunkReferences: Chunk[], k: number): Chunk[] {
    const chunkContentList = chunkReferences.map(chunk => chunk.content)
    //performBM25Scoring returns the output in a sorted order (descending of scores)
    // const output: BMDocument[] = performBM25Scoring(chunkContentList, chunkInput.content) as BMDocument[]
    const top3: BM25Document[] = new BM25Okapi(chunkContentList).topN(chunkInput.content, crossFileContextConfig.topK)

    return top3.map(doc => {
        // reference to the original metadata since BM25.top3 will sort the result
        const chunkIndex = doc.index
        const chunkReference = chunkReferences[chunkIndex]
        return {
            content: chunkReference.content,
            fileName: chunkReference.fileName,
            nextContent: chunkReference.nextContent,
            score: doc.score,
        }
    })
}

/* This extract 10 lines to the left of the cursor from trigger file.
 * This will be the inputquery to bm25 matching against list of cross-file chunks
 */
function getInputChunk(editor: vscode.TextEditor, chunkSize: number) {
    const cursorPosition = editor.selection.active
    const startLine = Math.max(cursorPosition.line - chunkSize, 0)
    const endLine = Math.max(cursorPosition.line - 1, 0)
    const inputChunkContent = editor.document.getText(
        new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length)
    )
    const inputChunk: Chunk = { fileName: editor.document.fileName, content: inputChunkContent, nextContent: '' }
    return inputChunk
}

/**
 * This linking is required from science experimentations to pass the next contnet chunk
 * when a given chunk context passes the match in BM25.
 * Special handling is needed for last(its next points to its own) and first chunk
 */
function linkChunks(chunks: Chunk[]) {
    const updatedChunks: Chunk[] = []

    // This additional chunk is needed to create a next pointer to chunk 0.
    const firstChunk = chunks[0]
    const firstChunkSubContent = firstChunk.content.split('\n').slice(0, 3).join('\n').trimEnd()
    const newFirstChunk = {
        fileName: firstChunk.fileName,
        content: firstChunkSubContent,
        nextContent: firstChunk.content,
    }
    updatedChunks.push(newFirstChunk)

    const n = chunks.length
    for (let i = 0; i < n; i++) {
        const chunk = chunks[i]
        const nextChunk = i < n - 1 ? chunks[i + 1] : chunk

        chunk.nextContent = nextChunk.content
        updatedChunks.push(chunk)
    }

    return updatedChunks
}

function splitFileToChunks(filePath: string, chunkSize: number): Chunk[] {
    const chunks: Chunk[] = []

    const fileContent = fs.readFileSync(filePath, 'utf-8').trimEnd()
    const lines = fileContent.split('\n')

    for (let i = 0; i < lines.length; i += chunkSize) {
        const chunkContent = lines.slice(i, Math.min(i + chunkSize, lines.length)).join('\n')
        const chunk = { fileName: filePath, content: chunkContent.trimEnd(), nextContent: '' }
        chunks.push(chunk)
    }
    return chunks
}

/**
 * This function will return relevant cross files for the given editor file
 * by referencing open files, imported files and same package files.
 */
async function getRelevantCrossFiles(editor: vscode.TextEditor, dependencyGraph: DependencyGraph): Promise<string[]> {
    const openedFilesInEditor = new Set(openFilesInWindow())

    let srcDependencies = await dependencyGraph.getSourceDependencies(editor.document.uri, editor.document.getText())
    srcDependencies = moveToFront(srcDependencies, openedFilesInEditor)

    const samePackageFiles = await dependencyGraph.getSamePackageFiles(
        editor.document.uri,
        dependencyGraph.getProjectPath(editor.document.uri)
    )
    const samePackageRelevantFiles = samePackageFiles.filter(file => {
        return isRelevant(editor.document.fileName, file, editor.document.languageId)
    })

    const mergedCrossFileList = [...new Set([...srcDependencies, ...samePackageRelevantFiles])]

    return mergedCrossFileList
}

// Util to move selected files to the front of the input array if it exists
function moveToFront(files: string[], picked: Set<string>) {
    const head: string[] = []
    const body: string[] = []
    files.forEach(file => {
        if (picked.has(file)) {
            head.push(file)
        } else {
            body.push(file)
        }
    })

    return [...head, ...body]
}

function openFilesInWindow(): string[] {
    const filesOpenedInEditor: string[] = []
    const tabArrays = vscode.window.tabGroups.all
    tabArrays.forEach(tabArray => {
        tabArray.tabs.forEach(tab => {
            try {
                filesOpenedInEditor.push((tab.input as any).uri.path)
            } catch (e) {}
        })
    })

    return filesOpenedInEditor
}

function throwIfCancelled(token: vscode.CancellationToken): void | never {
    if (token.isCancellationRequested) {
        throw new ToolkitError(supplemetalContextFetchingTimeoutMsg, { cause: new CancellationError('timeout') })
    }
}
