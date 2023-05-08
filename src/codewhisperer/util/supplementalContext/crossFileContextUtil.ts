/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as codewhispererClient from '../../client/codewhisperer'
import * as fs from 'fs-extra'
import { DependencyGraph } from '../dependencyGraph/dependencyGraph'
import { BMDocument, performBM25Scoring } from './rankBm25'
import { getRelevantFilesFromEditor, isRelevant } from './editorFilesUtil'
import { ToolkitError } from '../../../shared/errors'
import { supplemetalContextFetchingTimeoutMsg } from '../../models/constants'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'

const crossFileLanguageConfigs = ['java']
interface Chunk {
    fileName: string
    content: string
    nextContent: string
}
const chunkSize = 10
const chunkCount = 60
const topK = 3

export async function fetchSupplementalContextForSrc(
    editor: vscode.TextEditor,
    dependencyGraph: DependencyGraph,
    cancellationToken: vscode.CancellationToken
) {
    if (crossFileLanguageConfigs.includes(editor.document.languageId) === false) {
        return []
    }

    // Step 1: Get relevant cross files to refer
    const relevantCrossFilePaths = await getRelevantCrossFiles(editor, dependencyGraph)
    throwIfCancelled(cancellationToken)
    // Step 2: Split files to chunks with upper bound on chunkCount
    // We restrict the total number of chunks to improve on latency.
    // Chunk linking is required as we want to pass the next chunk value for matched chunk.
    const chunkList: Chunk[] = []
    for (const relevantFile of relevantCrossFilePaths) {
        throwIfCancelled(cancellationToken)

        const chunks: Chunk[] = splitFileToChunks(relevantFile, chunkSize)
        const linkedChunks = linkChunks(chunks)
        chunkList.push(...linkedChunks)
        if (chunkList.length >= chunkCount) {
            break
        }
    }

    // Step 3: Generate Input chunk (10 lines left of cursor position)
    // and Find Best K chunks w.r.t input chunk using BM25
    const inputChunk: Chunk = getInputChunk(editor, chunkSize)
    const bestChunks: Chunk[] = findBestKChunkMatches(inputChunk, chunkList, topK)
    throwIfCancelled(cancellationToken)

    // Step 4: Transform best chunks to supplemental contexts
    const supplementalContexts: codewhispererClient.SupplementalContext[] = []
    for (const chunk of bestChunks) {
        throwIfCancelled(cancellationToken)

        const context = {
            filePath: chunk.fileName,
            content: chunk.nextContent,
        } as codewhispererClient.SupplementalContext
        supplementalContexts.push(context)
    }

    return supplementalContexts
}

function findBestKChunkMatches(chunkInput: Chunk, chunkReferences: Chunk[], k: number) {
    const chunkContentList = chunkReferences.map(chunk => chunk.content)
    //performBM25Scoring returns the output in a sorted order (descending of scores)
    const output: BMDocument[] = performBM25Scoring(chunkContentList, chunkInput.content) as BMDocument[]
    const bestChunks: Chunk[] = []
    //pick Top 3
    for (let i = 0; i < k; i++) {
        const chunkIndex = output[i].index
        const chunkReference = chunkReferences[chunkIndex]
        bestChunks.push(chunkReference)
    }
    return bestChunks
}

/* This extract 10 lines to the left of the cursor from trigger file.
 * This will be the inputquery to bm25 matching against list of cross-file chunks
 */
function getInputChunk(editor: vscode.TextEditor, chunkSize: number) {
    const cursorPosition = editor.selection.active
    const startLine = Math.max(cursorPosition.line - 10, 0)
    const endLine = cursorPosition.line - 1
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
    const firstChunkSubContent = firstChunk.content.split('\n').slice(0, 3).join('\n')
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

    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const lines = fileContent.split('\n')

    for (let i = 0; i < lines.length; i += chunkSize) {
        const chunkContent = lines.slice(i, Math.min(i + chunkSize, lines.length)).join('\n')
        const chunk = { fileName: filePath, content: chunkContent, nextContent: '' }
        chunks.push(chunk)
    }
    return chunks
}

/**
 * This function will return relevant cross files for the given editor file
 * by referencing open files, imported files and same package files.
 */
async function getRelevantCrossFiles(editor: vscode.TextEditor, dependencyGraph: DependencyGraph): Promise<string[]> {
    const srcDependencies = await dependencyGraph.getSourceDependencies(editor.document.uri, editor.document.getText())

    const samePackageFiles = await dependencyGraph.getSamePackageFiles(
        editor.document.uri,
        dependencyGraph.getProjectPath(editor.document.uri)
    )
    const samePackageRelevantFiles = samePackageFiles.filter(file => {
        return isRelevant(editor.document.fileName, file, editor.document.languageId)
    })

    const relevantOpenFiles: vscode.Uri[] = await getRelevantFilesFromEditor(
        editor.document.fileName,
        editor.document.languageId
    )

    // We refer to only those open files which are in srcDependencies
    const filteredRelevantOpenFiles = relevantOpenFiles
        .filter(file => srcDependencies.includes(file.fsPath))
        .map(file => file.fsPath)

    const mergedCrossFileList = [
        ...new Set([...filteredRelevantOpenFiles, ...srcDependencies, ...samePackageRelevantFiles]),
    ]

    return mergedCrossFileList
}

function throwIfCancelled(token: vscode.CancellationToken): void | never {
    if (token.isCancellationRequested) {
        throw new ToolkitError(supplemetalContextFetchingTimeoutMsg, { cause: new CancellationError('timeout') })
    }
}
