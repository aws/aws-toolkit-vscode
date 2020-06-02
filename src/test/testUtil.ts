/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fsextra from 'fs-extra'

import * as pathutil from '../shared/utilities/pathUtils'

/**
 * Writes the string form of `o` to `filepath` as UTF-8 text.
 */
export function toFile(o: any, filepath: string) {
    const text = o ? o.toString() : ''
    fsextra.writeFileSync(filepath, text, 'utf8')
}

/** Gets the full path to the project root directory. */
export function getProjectDir(): string {
    return path.join(__dirname, '../')
}

/** Creates a `WorkspaceFolder` for use in tests. */
export function getWorkspaceFolder(dir: string): vscode.WorkspaceFolder {
    const folder = {
        uri: vscode.Uri.file(dir),
        name: 'test-workspace-folder',
        index: 0,
    }
    return folder
}

/**
 * Asserts that filepaths are equal, after normalizing for platform differences.
 */
export function assertEqualPaths(actual: string, expected: string, message?: string | Error) {
    assert.strictEqual(pathutil.normalize(actual), pathutil.normalize(expected), message)
}

/**
 * Asserts that UTF-8 contents of `file` are equal to `expected`.
 */
export function assertFileText(file: string, expected: string, message?: string | Error) {
    const actualContents = fsextra.readFileSync(file, 'utf-8')
    assert.strictEqual(actualContents, expected, message)
}
