/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import '@cspotcode/source-map-support/register'
import * as path from 'path'
import Mocha from 'mocha'
import { glob } from 'glob'
import * as fs from 'fs-extra'

// Set explicit timezone to ensure that tests run locally do not use the user's actual timezone, otherwise
// the test can pass on one persons machine but not anothers.
// Intentionally _not_ UTC, to increase variation in tests.
// process.env.TZ = 'Europe/London'
process.env.TZ = 'US/Pacific'

/**
 * @param initTests List of relative paths to test files containing root hooks: https://mochajs.org/#available-root-hooks
 */
export async function runTests(testFolder: string, initTests: string[] = [], testFiles?: string[]): Promise<void> {
    if (!process.env['AWS_TOOLKIT_AUTOMATION']) {
        throw new Error('Expected the "AWS_TOOLKIT_AUTOMATION" environment variable to be set for tests.')
    }

    function getRoot(): string {
        const abs = process.env['DEVELOPMENT_PATH'] ?? process.cwd()

        if (process.platform !== 'win32') {
            return abs
        }

        // Force all drive letters (or whatever else is before the first colon) to be lowercase.
        //
        // Node's `require` will always cache modules based off case-sensitive paths, regardless
        // of the underlying file system. This is normally not a problem, but VS Code also happens
        // to normalize paths on Windows to use lowercase drive letters when using its bootstrap loader.
        // This means that each module ends up getting loaded twice, once by the extension and once
        // by any test code, causing all sorts of bizarre behavior during tests.
        const [drive, ...rest] = abs.split(':')
        return rest.length === 0 ? abs : [drive.toLowerCase(), ...rest].join(':')
    }

    const root = getRoot()
    const outputFile = path.resolve(root, '../../', '.test-reports', 'report.xml')
    const colorOutput = !process.env['AWS_TOOLKIT_TEST_NO_COLOR']

    // Create the mocha test
    const mocha = new Mocha({
        ui: 'bdd',
        color: colorOutput,
        reporter: 'mocha-multi-reporters',
        reporterOptions: {
            reporterEnabled: 'mocha-junit-reporter, spec',
            mochaJunitReporterReporterOptions: {
                mochaFile: outputFile,
            },
        },
        timeout: 0,
    })

    const dist = path.resolve(root, 'dist')
    const testFile = process.env['TEST_FILE']?.replace('.ts', '.js')
    const testFilePath = testFile ? path.resolve(dist, testFile) : undefined

    if (testFile && testFiles) {
        throw new Error('Individual file and list of files given to run tests on. One must be chosen.')
    }

    // The `require` option for Mocha isn't working for some reason (maybe user error?)
    // So instead we are loading the modules ourselves and registering the relevant hooks
    initTests.forEach(relativePath => {
        const fullPath = path.join(dist, relativePath).replace('.ts', '.js')
        if (!fs.pathExistsSync(fullPath)) {
            console.error(`error: missing ${fullPath}`)
            throw Error(`missing ${fullPath}`)
        }

        const pluginFile = require(fullPath)
        if (pluginFile.mochaGlobalSetup) {
            mocha.globalSetup(pluginFile.mochaGlobalSetup)
        }
        if (pluginFile.mochaGlobalTeardown) {
            mocha.globalTeardown(pluginFile.mochaGlobalTeardown)
        }
        if (pluginFile.mochaHooks) {
            mocha.rootHooks(pluginFile.mochaHooks)
        }
    })

    function runMocha(files: string[]): Promise<void> {
        files.forEach(f => mocha.addFile(path.resolve(dist, f)))
        return new Promise<void>((resolve, reject) => {
            mocha.run(failures => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`))
                } else {
                    resolve()
                }
            })
        })
    }

    async function writeCoverage(): Promise<void> {
        const coverage = (globalThis as typeof globalThis & { __coverage__?: any }).__coverage__

        if (coverage) {
            const dst = path.resolve(root, '.nyc_output', 'out.json')
            console.log(`Writing test coverage to "${dst}"`)
            await fs.ensureDir(path.dirname(dst))
            await fs.writeFile(dst, JSON.stringify(coverage))
        } else {
            console.log('No test coverage found')
        }
    }
    const files = testFiles ?? (await glob(testFilePath ?? `**/${testFolder}/**/**.test.js`, { cwd: dist }))

    await runMocha(files)
    await writeCoverage()
}
