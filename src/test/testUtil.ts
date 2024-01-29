/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as pathutil from '../shared/utilities/pathUtils'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../shared/filesystemUtilities'
import globals from '../shared/extensionGlobals'
import { waitUntil } from '../shared/utilities/timeoutUtils'
import { MetricName, MetricShapes } from '../shared/telemetry/telemetry'
import { keys, selectFrom } from '../shared/utilities/tsUtils'
import { fsCommon } from '../srcShared/fs'

const testTempDirs: string[] = []

/**
 * Writes the string form of `o` to `filePathParts` as UTF-8 text.
 *
 * Creates parent directories in `filePathParts`, if necessary.
 */
export async function toFile(o: any, ...filePathParts: string[]) {
    const text = o ? o.toString() : ''
    const filePath = path.join(...filePathParts)
    const dir = path.dirname(filePath)
    await fsCommon.mkdir(dir)
    await fsCommon.writeFile(filePath, text)
}

/**
 * Gets the contents of `filepath` as UTF-8 encoded string.
 */
export async function fromFile(filepath: string): Promise<string> {
    return fsCommon.readFileAsString(filepath)
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
 * @param subDir Optional subdirectory created in the workspace folder and returned in the result.
 */
export async function createTestWorkspaceFolder(name?: string, subDir?: string): Promise<vscode.WorkspaceFolder> {
    const tempFolder = await makeTemporaryToolkitFolder()
    testTempDirs.push(tempFolder)
    const finalWsFolder = subDir === undefined ? tempFolder : path.join(tempFolder, subDir)
    if (subDir !== undefined && subDir.length > 0) {
        await fs.promises.mkdir(finalWsFolder, { recursive: true })
    }
    return {
        uri: vscode.Uri.file(finalWsFolder),
        name: name ?? 'test-workspace-folder',
        index: 0,
    }
}

export async function createTestFile(fileName: string): Promise<vscode.Uri> {
    const tempFolder = await makeTemporaryToolkitFolder()
    testTempDirs.push(tempFolder) // ensures this is deleted at the end
    const tempFilePath = path.join(tempFolder, fileName)
    await fsCommon.writeFile(tempFilePath, '')
    return vscode.Uri.file(tempFilePath)
}

/**
 * Creates a temporary workspace with test files in it.
 *
 * @param n number of temporary test files to create in the workspace
 * @param opts allows to pass options to have a custom fileName and/or file content and also to add a file with an exclusion pattern from src/shared/fs/watchedFiles.ts
 * @returns the path to the workspace folder
 */
export async function createTestWorkspace(
    n: number,
    opts: {
        /**
         * optional filename prefix for all created files
         */
        fileNamePrefix?: string
        /**
         * optional file content
         */
        fileContent?: string
        /**
         * name of the workspace folder
         */
        workspaceName?: string
        /**
         * the subDir where the workspace folder will point to within the temp folder
         */
        subDir?: string
    }
): Promise<vscode.WorkspaceFolder> {
    const workspace = await createTestWorkspaceFolder(opts.workspaceName, opts.subDir)

    if (n <= 0) {
        throw new Error('test file numbers cannot be less or equal to zero')
    }

    const fileNamePrefix = opts?.fileNamePrefix ?? 'test-file-'
    const fileContent = opts?.fileContent ?? ''

    do {
        const tempFilePath = path.join(workspace.uri.fsPath, `${fileNamePrefix}${n}`)
        await fsCommon.writeFile(tempFilePath, fileContent)
    } while (--n > 0)

    return workspace
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
export async function assertFileText(file: string, expected: string, message?: string | Error) {
    const actualContents = await fsCommon.readFileAsString(file)
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
export async function createExecutableFile(filepath: string, contents: string): Promise<void> {
    await fsCommon.mkdir(path.dirname(filepath))
    if (process.platform === 'win32') {
        await fsCommon.writeFile(filepath, `@echo OFF$\r\n${contents}\r\n`)
    } else {
        await fsCommon.writeFile(filepath, `#!/bin/sh\n${contents}`)
        fs.chmodSync(filepath, 0o744)
    }
}

/**
 * Installs a fake clock in place of `globals.clock` and allows you to
 * control time in tests.
 *
 * **Implementations must use `globals.clock` for this to work.**
 *
 * @example
 * new globals.clock.Date() // Use this
 * new Date() // Not this
 *
 * globals.clock.setTimeout(...) // Use this
 * setTimeout(...) // Not this
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
export async function assertTextEditorContains(contents: string, exact: boolean = true): Promise<void | never> {
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
        if (exact) {
            assert.strictEqual(actual.getText(), contents, message)
        } else {
            assert(actual.getText().includes(contents), message)
        }
    }
}

/**
 * Create and open an editor with provided fileText, fileName and options. If folder is not provided,
 * will create a temp worksapce folder which will be automatically deleted in testing environment
 * @param fileText The supplied text to fill this file with
 * @param fileName The name of the file to save it as. Include the file extension here.
 *
 * @returns TextEditor that was just opened
 */
export async function openATextEditorWithText(
    fileText: string,
    fileName: string,
    folder?: string,
    options?: vscode.TextDocumentShowOptions
): Promise<vscode.TextEditor> {
    const myWorkspaceFolder = folder ? folder : (await createTestWorkspaceFolder()).uri.fsPath
    const filePath = path.join(myWorkspaceFolder, fileName)
    await toFile(fileText, filePath)

    const textDocument = await vscode.workspace.openTextDocument(filePath)

    return await vscode.window.showTextDocument(textDocument, options)
}

/**
 * Waits for _any_ tab to appear and have the desired count
 */
export async function assertTabCount(size: number): Promise<void | never> {
    const tabs = await waitUntil(
        async () => {
            const tabs = vscode.window.tabGroups.all
                .map(tabGroup => tabGroup.tabs)
                .reduce((acc, curVal) => acc.concat(curVal), [])

            if (tabs.length === size) {
                return tabs
            }
        },
        { interval: 5 }
    )

    if (!tabs) {
        throw new Error('No desired tabs found')
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

    // Ignore these "editors" not closed by "openEditors.closeAll":
    //  - `vscode.OutputChannel` name prefixed with "extension-output". https://github.com/microsoft/vscode/issues/148993#issuecomment-1167654358
    //  - `vscode.LogOutputChannel` name (created with `vscode.window.createOutputChannel(…,{log:true})`
    // Maybe we can close these with a command?
    const ignorePatterns = [/extension-output/, /tasks/, /amazonwebservices\.aws-toolkit-vscode\./]
    const editors: vscode.TextEditor[] = []

    const noVisibleEditor: boolean | undefined = await waitUntil(
        async () => {
            // Race: documents could appear after the call to closeAllEditors(), so retry.
            await vscode.commands.executeCommand(closeAllCmd)
            editors.length = 0
            editors.push(
                ...vscode.window.visibleTextEditors.filter(
                    editor => !ignorePatterns.find(p => p.test(editor.document.fileName))
                )
            )

            return editors.length === 0
        },
        {
            timeout: 5000, // Arbitrary values. Should succeed except when VS Code is lagging heavily.
            interval: 250,
            truthy: true,
        }
    )

    if (!noVisibleEditor) {
        const editorNames = editors.map(editor => `\t${editor.document.fileName}`)
        throw new Error(`Editors were still open after closeAllEditors():\n${editorNames.join('\n')}`)
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

/**
 * Shuffle a list, Fisher-Yates Sorting Algorithm
 */
export function shuffleList<T>(list: T[]): T[] {
    const shuffledList = [...list]

    for (let i = shuffledList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffledList[i], shuffledList[j]] = [shuffledList[j], shuffledList[i]]
    }

    return shuffledList
}
