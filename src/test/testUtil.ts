/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as fsextra from 'fs-extra'
import * as FakeTimers from '@sinonjs/fake-timers'

import * as pathutil from '../shared/utilities/pathUtils'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../shared/filesystemUtilities'

const testTempDirs: string[] = []

/**
 * Writes the string form of `o` to `filepath` as UTF-8 text.
 *
 * Creates parent directories in `filepath`, if necessary.
 */
export function toFile(o: any, filepath: string) {
    const text = o ? o.toString() : ''
    const dir = path.dirname(filepath)
    fsextra.mkdirpSync(dir)
    fsextra.writeFileSync(filepath, text, 'utf8')
}

/**
 * Gets the contents of `filepath` as UTF-8 encoded string.
 */
export function fromFile(filepath: string): string {
    return fsextra.readFileSync(filepath, { encoding: 'utf8' })
}

/** Gets the full path to the Toolkit source root on this machine. */
export function getProjectDir(): string {
    return path.join(__dirname, '../')
}

/** Instantiates a `WorkspaceFolder` object for use in tests. */
export function getWorkspaceFolder(dir: string): vscode.WorkspaceFolder {
    const folder = {
        uri: vscode.Uri.file(dir),
        name: 'test-workspace-folder',
        index: 0,
    }
    return folder
}

/**
 * Creates a random, temporary workspace folder on the filesystem and returns a
 * `WorkspaceFolder` object.
 *
 * @param name  Optional name, defaults to "test-workspace-folder".
 */
export async function createTestWorkspaceFolder(name?: string): Promise<vscode.WorkspaceFolder> {
    const tempFolder = await makeTemporaryToolkitFolder()
    testTempDirs.push(tempFolder)
    return {
        uri: vscode.Uri.file(tempFolder),
        name: name ?? 'test-workspace-folder',
        index: 0,
    }
}

export async function deleteTestTempDirs(): Promise<void> {
    let failed = 0
    for (const s of testTempDirs) {
        if (!tryRemoveFolder(s)) {
            failed += 1
        }
    }
    if (failed > 0) {
        console.error('deleteTestTempDirs: failed to delete %d/%d test temp dirs', failed, testTempDirs.length)
    } else {
        console.error('deleteTestTempDirs: deleted %d test temp dirs', testTempDirs.length)
    }
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

/** A lot of code will create a Promise, tick the clock, then wait for resolution. This function turns 3 lines into 1. */
export async function tickPromise<T>(promise: Promise<T>, clock: FakeTimers.InstalledClock, t: number): Promise<T> {
    clock.tick(t)
    return await promise
}
