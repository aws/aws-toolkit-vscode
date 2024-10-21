/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as pathutil from '../shared/utilities/pathUtils'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../shared/filesystemUtilities'
import globals from '../shared/extensionGlobals'
import { waitUntil } from '../shared/utilities/timeoutUtils'
import { MetricName, MetricShapes } from '../shared/telemetry/telemetry'
import { keys, selectFrom } from '../shared/utilities/tsUtils'
import fs from '../shared/fs/fs'
import { DeclaredCommand } from '../shared/vscode/commands2'
import { mkdirSync, existsSync } from 'fs' // eslint-disable-line no-restricted-imports
import { randomBytes } from 'crypto'
import request from '../shared/request'
import { stub } from 'sinon'

const testTempDirs: string[] = []

/**
 * Writes the string form of `o` to `filepath` as UTF-8 text.
 *
 * Creates parent directories in `filepath`, if necessary.
 */
export async function toFile(o: any, filepath: string | vscode.Uri) {
    const file = typeof filepath === 'string' ? filepath : filepath.fsPath
    const text = o === undefined ? '' : o.toString()
    const dir = path.dirname(file)
    await fs.mkdir(dir)
    await fs.writeFile(file, text)
}

/**
 * Gets the contents of `filepath` as UTF-8 encoded string.
 */
export async function fromFile(filepath: string): Promise<string> {
    return await fs.readFileText(filepath)
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
 * An all-in-one solution for a folder to use during tests:
 * - Cleans up after all tests complete
 * - Each instance is isolated from other tests
 * - Convenient methods for files operations on paths RELATIVE to the folder
 *
 * Create an instance using {@link TestFolder.create()}.
 *
 * Add any new methods to this class when needed.
 *
 * ---
 *
 * IMPORTANT:Web: This uses Node specific FS functions.
 * This class is used in our agnostic FileSystem unit tests to do the setup.
 * Since we do not want our FS code to be used to test itself, we aren't using it here.
 * But if the day comes that we need it for web, we should be able to add some agnostic FS methods in here.
 */
export class TestFolder {
    protected constructor(public readonly path: string) {}

    /** Creates a folder that deletes itself once all tests are done running. */
    static async create() {
        const rootFolder = (await createTestWorkspaceFolder()).uri.fsPath
        return new TestFolder(rootFolder)
    }

    /**
     * Creates a file at the given path relative to the test folder.
     * Any directories that do not exist in the given path will also be created.
     *
     * @returns an absolute path to the file
     */
    async write(relativeFilePath: string, content?: string, options?: { mode?: number }): Promise<string> {
        const filePath = path.join(this.path, relativeFilePath)

        await toFile(content ?? '', filePath)

        if (options?.mode !== undefined) {
            await fs.chmod(filePath, options.mode)
        }

        return filePath
    }

    /**
     * Creates a directory at the given path relative to the test folder.
     *
     * @returns an absolute path to the folder
     */
    async mkdir(relativeDirPath?: string): Promise<string> {
        relativeDirPath ??= randomBytes(4).toString('hex')
        const absolutePath = this.pathFrom(relativeDirPath)
        mkdirSync(absolutePath, { recursive: true })
        assert(existsSync(absolutePath))
        return absolutePath
    }

    /** Returns an absolute path compose of the test folder path and the given relative path. */
    pathFrom(relativePath: string): string {
        return path.join(this.path, relativePath)
    }
}

/**
 * @deprecated Use {@link TestFolder} instead.
 *
 * TODO: move this inside of {@link TestFolder}.
 *
 * ---
 *
 * Creates a random, temporary workspace folder on the filesystem and returns a `WorkspaceFolder`
 * object. The folder will be automatically deleted after tests complete.
 *
 * @param name  Folder name (default: "test-workspace-folder").
 * @param subDir Subdirectory created in the workspace folder and returned in the result.
 */
export async function createTestWorkspaceFolder(name?: string, subDir?: string): Promise<vscode.WorkspaceFolder> {
    const tempFolder = await makeTemporaryToolkitFolder()
    testTempDirs.push(tempFolder)
    const finalWsFolder = subDir === undefined ? tempFolder : path.join(tempFolder, subDir)
    if (subDir !== undefined && subDir.length > 0) {
        await fs.mkdir(finalWsFolder)
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
    await fs.writeFile(tempFilePath, '')
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
        /**
         * optional file name suffix
         */
        fileNameSuffix?: string
    }
): Promise<vscode.WorkspaceFolder> {
    const workspace = await createTestWorkspaceFolder(opts.workspaceName, opts.subDir)

    if (n <= 0) {
        throw new Error('test file numbers cannot be less or equal to zero')
    }

    const fileNamePrefix = opts?.fileNamePrefix ?? 'test-file-'
    const fileNameSuffix = opts?.fileNameSuffix ?? ''
    const fileContent = opts?.fileContent ?? ''

    do {
        const tempFilePath = path.join(workspace.uri.fsPath, `${fileNamePrefix}${n}${fileNameSuffix}`)
        await fs.writeFile(tempFilePath, fileContent)
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
    const actualContents = await fs.readFileText(file)
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
    await fs.mkdir(path.dirname(filepath))
    if (process.platform === 'win32') {
        await fs.writeFile(filepath, `@echo OFF$\r\n${contents}\r\n`)
    } else {
        await fs.writeFile(filepath, `#!/bin/sh\n${contents}`)
        await fs.chmod(filepath, 0o744)
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
 * Asserts that no metrics metadata (key OR value) matches the given regex.
 * @param keyword target substring to search for
 */
export function assertNoTelemetryMatch(re: RegExp | string): void | never {
    return assert.ok(globals.telemetry.logger.queryRegex(re).length === 0)
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

    // When an empty expected array was given
    if (Array.isArray(expected) && expected.length === 0) {
        if (metadata.length === 0) {
            // succeeds if no results found, but none were expected
            return
        }
        assert.fail(`Expected no metrics for "${name}", but some exist`)
    }

    assert.ok(metadata.length > 0, `telemetry metric not found: "${name}"`)

    for (let i = 0; i < expectedList.length; i++) {
        const metric = expectedList[i]
        const expectedCopy = { ...metric } as { -readonly [P in keyof MetricShapes[K]]: MetricShapes[K][P] }
        const passive = expectedCopy?.passive
        delete expectedCopy['passive']

        Object.keys(expectedCopy).forEach(
            (k) => ((expectedCopy as any)[k] = (expectedCopy as Record<string, any>)[k]?.toString())
        )

        const msg = `telemetry metric ${i + 1} (of ${
            expectedList.length
        }) not found (in the expected order): "${name}" `
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
 * Saves `fileText` to `fileName` relative to `folder` (or an auto-created temp workspace folder,
 * which will be automatically deleted after tests finish), and opens it as a `TextDocument` (not
 * a `TextEditor`, which is *slow*; use {@link toTextEditor} for that).
 *
 * @param fileText Text content
 * @param fileName Name of the file (including extension) to save it as.
 * @param folder?  Optional workspace folder where the file will be written to.
 *
 * @returns TextDocument that was just opened
 */
export async function toTextDocument(
    fileText: string,
    fileName: string,
    folder?: string
): Promise<ReturnType<typeof vscode.workspace.openTextDocument>> {
    const myWorkspaceFolder = folder ? folder : (await createTestWorkspaceFolder()).uri.fsPath
    const filePath = path.join(myWorkspaceFolder, fileName)
    await toFile(fileText, filePath)

    return await vscode.workspace.openTextDocument(filePath)
}

/**
 * Same as {@link toTextDocument}, but opens the result in a TextEditor. This is *much* slower, use
 * `toTextDocument` if you don't need a text editor.
 *
 * @param fileText Text content
 * @param fileName Name of the file (including extension) to save it as.
 * @param folder?  Optional workspace folder where the file will be written to.
 *
 * @returns TextEditor that was just opened
 */
export async function toTextEditor(
    fileText: string,
    fileName: string,
    folder?: string,
    options?: vscode.TextDocumentShowOptions
): Promise<vscode.TextEditor> {
    const textDocument = await toTextDocument(fileText, fileName, folder)

    return await vscode.window.showTextDocument(textDocument, options)
}

/**
 * Waits for _any_ tab to appear and have the desired count
 */
export async function assertTabCount(size: number): Promise<void | never> {
    const tabs = await waitUntil(
        async () => {
            const tabs = vscode.window.tabGroups.all
                .map((tabGroup) => tabGroup.tabs)
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
    // For nullExtensionDescription, see https://github.com/aws/aws-toolkit-vscode/issues/4658
    const ignorePatterns = [
        /extension-output/,
        /tasks/,
        /amazonwebservices\.[a-z\-]+-vscode\./,
        /nullExtensionDescription./, // Sometimes exists instead of the prior line, see https://github.com/aws/aws-toolkit-vscode/issues/4658
    ]
    const editors: vscode.TextEditor[] = []

    const noVisibleEditor: boolean | undefined = await waitUntil(
        async () => {
            // Race: documents could appear after the call to closeAllEditors(), so retry.
            await vscode.commands.executeCommand(closeAllCmd)
            editors.length = 0
            editors.push(
                ...vscode.window.visibleTextEditors.filter(
                    (editor) => !ignorePatterns.some((p) => p.test(editor.document.fileName))
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
        const editorNames = editors.map((editor) => `\t${editor.document.fileName}`)
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
    listeners.push(event((data) => emits.push(data)))

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
    return captureEventNTimes(event, 1, timeout)
}

export function captureEventNTimes<T>(event: vscode.Event<T>, amount: number, timeout?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const stop = () => reject(new Error('Timed out waiting for event'))
        let count = 0
        event((data) => {
            if (++count === amount) {
                resolve(data)
            }
        })

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

/**
 * Try to register a command for tests since some commands are only registered during
 * extension activation. These commands will need to be manually activated here.
 *
 * Swallows 'already exists' exceptions because these commands can persist
 * across tests.
 *
 * TODO: This is a workaround because some code being tested exists in multiple extensions.
 * Activating/debugging multiple extensions at once is currently not functional.
 * To avoid this, we should drop tests/code down to their respective extensions.
 */
export function tryRegister(command: DeclaredCommand<() => Promise<any>>) {
    try {
        command.register()
    } catch (err) {
        if (!(err as Error).message.includes('already exists')) {
            throw err
        }
    }
}

// Returns a stubbed fetch for other tests.
export function getFetchStubWithResponse(response: Partial<Response>) {
    return stub(request, 'fetch').returns({ response: new Promise((res, _) => res(response)) } as any)
}

export function copyEnv(): NodeJS.ProcessEnv {
    return { ...process.env }
}
