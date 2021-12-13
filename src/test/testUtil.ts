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
import * as telemetry from '../shared/telemetry/telemetry'
import * as pathutil from '../shared/utilities/pathUtils'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../shared/filesystemUtilities'
import globals from '../shared/extensionGlobals'

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
        fs.writeFileSync(filepath, contents)
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

type Telemetry = Omit<typeof telemetry, 'millisecondsSince'>
// hard-coded, need significant updates to the codgen to make these kinds of things easier
type Namespace =
    | 'vpc'
    | 'sns'
    | 'sqs'
    | 's3'
    | 'session'
    | 'schemas'
    | 'sam'
    | 'redshift'
    | 'rds'
    | 'lambda'
    | 'aws'
    | 'ecs'
    | 'ecr'
    | 'cdk'
    | 'apprunner'
    | 'dynamicresource'
    | 'toolkit'
    | 'cloudwatchinsights'
    | 'iam'
    | 'ec2'
    | 'dynamodb'
    | 'codecommit'
    | 'cloudwatchlogs'
    | 'beanstalk'
    | 'cloudfront'
    | 'apigateway'
    | 'vscode'
type NameFromFunction<T extends keyof Telemetry> = T extends `record${infer P}`
    ? Uncapitalize<P> extends `${Namespace}${infer L}`
        ? Uncapitalize<P> extends `${infer N}${L}`
            ? `${N}_${Uncapitalize<L>}`
            : never
        : never
    : never
type MetricName = NameFromFunction<keyof Telemetry>
type FunctionNameFromName<S extends MetricName> = S extends `${infer N}_${infer M}`
    ? `record${Capitalize<N>}${Capitalize<M>}`
    : never
type FunctionFromName<S extends MetricName> = FunctionNameFromName<S> extends keyof Telemetry
    ? Telemetry[FunctionNameFromName<S>]
    : never
type TelemetryMetric<K extends MetricName> = NonNullable<Parameters<FunctionFromName<K>>[0]>

/**
 * Finds the first emitted telemetry metric with the given name, then checks if the metadata fields
 * match the expected values.
 */
export function assertTelemetry<K extends MetricName>(name: K, expected: TelemetryMetric<K>): void | never {
    const expectedCopy = { ...(expected as Record<string, unknown>) } as NonNullable<
        Parameters<Telemetry[keyof Telemetry]>[0]
    >
    const passive = expectedCopy?.passive
    const query = { metricName: name, filters: ['awsAccount'] }
    delete expectedCopy['passive']

    Object.keys(expectedCopy).forEach(
        k => ((expectedCopy as Record<string, string>)[k] = (expectedCopy as Record<string, any>)[k]?.toString())
    )

    const metadata = globals.telemetry.logger.query(query)
    assert.ok(metadata.length > 0, `Telemetry did not contain any metrics with the name "${name}"`)
    assert.deepStrictEqual(metadata[0], expectedCopy)

    if (passive !== undefined) {
        const metric = globals.telemetry.logger.queryFull(query)
        assert.strictEqual(metric[0].Passive, passive)
    }
}

/**
 * Curried form of {@link assertTelemetry} for when you want partial application.
 */
export const assertTelemetryCurried =
    <K extends MetricName>(name: K) =>
    (expected: TelemetryMetric<K>) =>
        assertTelemetry(name, expected)
