/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as fs from 'fs-extra'
import * as vscode from 'vscode'
import * as fsextra from 'fs-extra'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as pathutil from '../shared/utilities/pathUtils'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../shared/filesystemUtilities'
import globals from '../shared/extensionGlobals'
import { waitUntil } from '../shared/utilities/timeoutUtils'
import { MetricName, MetricShapes } from '../shared/telemetry/telemetry'
import { keys, selectFrom } from '../shared/utilities/tsUtils'

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

/**
 * Creates an executable file (including any parent directories) with the given contents.
 */
export function createExecutableFile(filepath: string, contents: string): void {
    fs.mkdirpSync(path.dirname(filepath))
    if (process.platform === 'win32') {
        fs.writeFileSync(filepath, `@echo OFF$\r\n${contents}\r\n`)
    } else {
        fs.writeFileSync(filepath, `#!/bin/sh\n${contents}`)
        fs.chmodSync(filepath, 0o744)
    }
}

/**
 * Installs a fake clock, making sure to set a flag to clear real timers.
 *
 * Always uses the extension-scoped clock instead of the real one.
 *
 * **Implementations must use `globals.clock` to be correctly tested**
 */
export function installFakeClock(): FakeTimers.InstalledClock {
    return FakeTimers.withGlobal(globals.clock).install({
        shouldClearNativeTimers: true,
        shouldAdvanceTime: false,
    })
}

/**
 * Gets all recorded metrics with the corresponding name.
 *
 * Unlike {@link assertTelemetry}, this function does not do any transformations to
 * handle fields being converted into strings. It will also not return `passive` or `value`.
 */
export function getMetrics<K extends MetricName>(name: K): readonly Partial<MetricShapes[K]>[] {
    const query = { metricName: name }

    return globals.telemetry.logger.query(query) as unknown as Partial<MetricShapes[K]>[]
}

// Note that Typescript is unable to describe the set of all supertypes of a type.
// This should be typed something like `asserts actual is * extends T`
export function partialDeepCompare<T>(actual: unknown, expected: T, message?: string): asserts actual is T {
    if (typeof actual !== 'object' || !actual || typeof expected !== 'object' || !expected) {
        assert.deepStrictEqual(actual, expected, message)
    }

    const partial = selectFrom(actual, ...keys(expected as object))
    assert.deepStrictEqual(partial, expected, message)
}

/**
 * Finds the emitted telemetry metrics with the given `name`, then checks if the metadata fields
 * match the expected values, in the order specified by `expected`. Comparisons are done using
 * {@link partialDeepCompare}. **Only fields present in {@link expected} will be checked.**
 *
 * @param name Metric name
 * @param expected Metric(s) shape(s) which are compared _in order_ to metrics matching `name`.
 */
export function assertTelemetry<K extends MetricName>(
    name: K,
    expected: MetricShapes[K] | MetricShapes[K][]
): void | never
export function assertTelemetry<K extends MetricName>(
    name: K,
    expected: MetricShapes[MetricName] | MetricShapes[MetricName][]
): void | never
export function assertTelemetry<K extends MetricName>(
    name: K,
    expected: MetricShapes[K] | MetricShapes[K][]
): void | never {
    const expectedList = Array.isArray(expected) ? expected : [expected]
    const query = { metricName: name }
    const metadata = globals.telemetry.logger.query(query)
    assert.ok(metadata.length > 0, `telemetry not found for metric name: "${name}"`)

    for (let i = 0; i < expectedList.length; i++) {
        const metric = expectedList[i]
        const expectedCopy = { ...metric } as { -readonly [P in keyof MetricShapes[K]]: MetricShapes[K][P] }
        const passive = expectedCopy?.passive
        delete expectedCopy['passive']

        Object.keys(expectedCopy).forEach(
            k => ((expectedCopy as any)[k] = (expectedCopy as Record<string, any>)[k]?.toString())
        )

        const msg = `telemetry item ${i + 1} (of ${
            expectedList.length
        }) not found (in the expected order) for metric name: "${name}" `
        partialDeepCompare(metadata[i], expectedCopy, msg)

        // Check this explicitly because we deleted it above.
        if (passive !== undefined) {
            const metric = globals.telemetry.logger.queryFull(query)
            assert.strictEqual(metric[0].Passive, passive)
        }
    }
}

/**
 * Curried form of {@link assertTelemetry} for when you want partial application.
 */
export const assertTelemetryCurried =
    <K extends MetricName>(name: K) =>
    (expected: MetricShapes[K]) =>
        assertTelemetry(name, expected)

/**
 * Waits for _any_ active text editor to appear and have the desired contents.
 * This is important since there may be delays between showing a new document and
 * updates to the `activeTextEditor` field.
 *
 * Assumes that only a single document will be edited while polling. The contents of
 * the document must match exactly to the text editor at some point, otherwise this
 * function will timeout.
 */
export async function assertTextEditorContains(contents: string): Promise<void | never> {
    const editor = await waitUntil(
        async () => {
            if (vscode.window.activeTextEditor?.document.getText() === contents) {
                return vscode.window.activeTextEditor
            }
        },
        { interval: 5 }
    )

    if (!vscode.window.activeTextEditor) {
        throw new Error('No active text editor found')
    }

    if (!editor) {
        const actual = vscode.window.activeTextEditor.document
        const documentName = actual.uri.toString(true)
        const message = `Document "${documentName}" contained "${actual.getText()}", expected: "${contents}"`
        assert.strictEqual(actual.getText(), contents, message)
    }
}

/**
 * Executes the "openEditors.closeAll" command and asserts that all visible
 * editors were closed after waiting.
 */
export async function closeAllEditors(): Promise<void> {
    // Derived by inspecting 'Keyboard Shortcuts' via command `>Preferences: Open Keyboard Shortcuts`
    // Note: `workbench.action.closeAllEditors` is unreliable.
    const closeAllCmd = 'openEditors.closeAll'

    // Output channels are named with the prefix 'extension-output'
    // Maybe we can close these with a command?
    const ignorePatterns = [/extension-output/, /tasks/]

    const noVisibleEditor: boolean | undefined = await waitUntil(
        async () => {
            // Race: documents could appear after the call to closeAllEditors(), so retry.
            await vscode.commands.executeCommand(closeAllCmd)
            const visibleEditors = vscode.window.visibleTextEditors.filter(
                editor => !ignorePatterns.find(p => p.test(editor.document.fileName))
            )

            return visibleEditors.length === 0
        },
        {
            timeout: 2500, // Arbitrary values. Should succeed except when VS Code is lagging heavily.
            interval: 250,
            truthy: true,
        }
    )

    if (!noVisibleEditor) {
        const editors = vscode.window.visibleTextEditors.map(editor => `\t${editor.document.fileName}`)

        throw new Error(`The following editors were still open after closeAllEditors():\n${editors.join('\n')}`)
    }
}

export interface EventCapturer<T = unknown> extends vscode.Disposable {
    /**
     * All events captured after instrumentation
     */
    readonly emits: readonly T[]

    /**
     * The most recently emitted event
     */
    readonly last: T | undefined

    /**
     * Waits for the next event to be emitted
     */
    next(timeout?: number): Promise<T>
}

/**
 * Instruments an event for easier inspection.
 */
export function captureEvent<T>(event: vscode.Event<T>): EventCapturer<T> {
    let disposed = false
    let idx = 0
    const emits: T[] = []
    const listeners: vscode.Disposable[] = []
    listeners.push(event(data => emits.push(data)))

    return {
        emits,
        get last() {
            return emits[emits.length - 1]
        },
        next: (timeout?: number) => {
            if (disposed) {
                throw new Error('Capturer has been disposed')
            }

            if (idx < emits.length) {
                return Promise.resolve(emits[idx++])
            }

            return captureEventOnce(event, timeout)
        },
        dispose: () => {
            disposed = true
            vscode.Disposable.from(...listeners).dispose()
        },
    }
}

/**
 * Captures the first value emitted by an event, optionally with a timeout
 */
export function captureEventOnce<T>(event: vscode.Event<T>, timeout?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const stop = () => reject(new Error('Timed out waiting for event'))
        event(data => resolve(data))

        if (timeout !== undefined) {
            setTimeout(stop, timeout)
        }
    })
}
