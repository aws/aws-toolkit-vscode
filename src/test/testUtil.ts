/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import * as pathutil from '../shared/utilities/pathUtils'

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
export function assertEqualPaths(actual: string, expected: string) {
    assert.strictEqual(
        pathutil.normalize(pathutil.removeDriveLetter(actual)),
        pathutil.normalize(pathutil.removeDriveLetter(expected))
    )
}
