/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register'
import * as path from 'path'
import * as Mocha from 'mocha'
import * as glob from 'glob'
import * as fs from 'fs-extra'

/**
 * @param initTests List of relative paths to test files to run before all discovered tests.
 */
export async function runTestsInFolder(testFolder: string, initTests: string[] = []): Promise<void> {
    if (!process.env['AWS_TOOLKIT_AUTOMATION']) {
        throw new Error('Expected the "AWS_TOOLKIT_AUTOMATION" environment variable to be set for tests.')
    }

    const root = process.env['DEVELOPMENT_PATH'] ?? process.cwd()
    const outputFile = path.resolve(root, '.test-reports', 'report.xml')
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

    // Explicitly add additional tests (globalSetup) as the first tests.
    // TODO: migrate to mochaHooks (requires mocha 8.x).
    // https://mochajs.org/#available-root-hooks
    initTests.forEach(relativePath => {
        const fullPath = path.join(dist, relativePath).replace('.ts', '.js')
        if (!fs.pathExistsSync(fullPath)) {
            console.error(`error: missing ${fullPath}`)
            throw Error(`missing ${fullPath}`)
        }

        mocha.addFile(fullPath)
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
            await fs.writeFile(dst, JSON.stringify(coverage))
        } else {
            console.log('No test coverage found')
        }
    }

    const files = await new Promise<string[]>((resolve, reject) => {
        glob(testFilePath ?? `**/${testFolder}/**/**.test.js`, { cwd: dist }, (err, files) => {
            if (err) {
                reject(err)
            } else {
                resolve(files)
            }
        })
    })

    await runMocha(files)
    await writeCoverage()
}
