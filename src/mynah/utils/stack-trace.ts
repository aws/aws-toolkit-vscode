/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vs from 'vscode'
import { readImports } from './import-reader'

const PYTHON_STACK_TRACE = /File "(?<file>.+)", line (?<line>\d+), in /
const JAVA_STACK_TRACE = /\((?<file>.*):(?<line>\d+)\)/
const OTHER_STACK_TRACE = /[^(]*\((?<file>.*):(?<line>\d+):(\d+)\)/

export interface ErrorContext {
    readonly code: string
    readonly imports: string[]
    readonly file: string
}

export async function findErrorContext(stackTrace?: string, language?: string): Promise<ErrorContext | undefined> {
    if (stackTrace === undefined) {
        return undefined
    }
    let mostRecentCall
    if (language === 'python') {
        mostRecentCall = stackTrace.match(PYTHON_STACK_TRACE)
    } else if (language === 'java') {
        mostRecentCall = stackTrace.match(JAVA_STACK_TRACE)
    } else {
        // For example: at partition (/local/home/rwillems/workspaces/Scratchpad/folder/quicksort.js:16:11)\n    at quickSort (/local/home/rwillems/workspaces/Scratchpad/folder/quicksort.js:10:15)\n
        mostRecentCall = stackTrace.match(OTHER_STACK_TRACE)
    }
    const matchGroups = mostRecentCall?.groups
    if (matchGroups === undefined) {
        return undefined
    }
    const file = matchGroups.file
    const line = parseInt(matchGroups.line)

    const doc = await vs.workspace.openTextDocument(vs.Uri.file(file))
    const imports = await readImports(doc.getText(), doc.languageId)
    // Trace lines are 1-based but position lines are 0-based
    const codeRange = new vs.Range(new vs.Position(line - 2, 0), new vs.Position(line, 0))
    return {
        code: doc.getText(codeRange).trim(),
        imports,
        file,
    }
}
