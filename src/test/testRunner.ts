/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import 'source-map-support/register'
import * as path from 'path'
import * as Mocha from 'mocha'
import * as glob from 'glob'
import * as fs from 'fs'
import * as os from 'os'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const istanbul = require('istanbul')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const remapIstanbul = require('remap-istanbul')

export function runTestsInFolder(testFolder: string): Promise<void> {
    const outputFile = path.resolve(process.env['TEST_REPORT_DIR'] || '.test-reports', 'report.xml')
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

    // __dirname is dist/src
    // This becomes dist
    const testsRoot = path.resolve(__dirname, '..')

    return new Promise((c, e) => {
        // Read configuration for the coverage file
        let coverOptions: TestRunnerOptions = _readCoverOptions(testsRoot)
        if (coverOptions && coverOptions.enabled && !process.env['NO_COVERAGE']) {
            // Setup coverage pre-test, including post-test hook to report
            let coverageRunner = new CoverageRunner(coverOptions, testsRoot)
            coverageRunner.setupCoverage()
        }

        const testFile = process.env['TEST_FILE'] === 'null' ? undefined : process.env['TEST_FILE']
        const testFilePath = testFile?.replace(/^src[\\\/]/, '')?.concat('.js')

        const globalSetupPath = path.join(testsRoot, 'test', 'globalSetup.test.js')
        if (testFilePath && fs.existsSync(globalSetupPath)) {
            // XXX: explicitly add globalSetup, other tests depend on it.
            mocha.addFile(globalSetupPath)
        }

        glob(testFilePath ?? `**/${testFolder}/**/**.test.js`, { cwd: testsRoot }, (err, files) => {
            if (err) {
                return e(err)
            }

            // Add files to the test suite
            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)))

            try {
                // Run the mocha test
                mocha.run(failures => {
                    if (failures > 0) {
                        e(new Error(`${failures} tests failed.`))
                    } else {
                        c()
                    }
                })
            } catch (err) {
                console.error(err)
                e(err)
            }
        })
    })
}

// Adapted from https://github.com/codecov/example-typescript-vscode-extension
class CoverageRunner {
    private coverageVar: string = '$$cov_' + new Date().getTime() + '$$'
    private transformer: any = undefined
    private matchFn: any = undefined
    private instrumenter: any = undefined

    constructor(private options: TestRunnerOptions, private testsRoot: string) {}

    public setupCoverage(): void {
        // Set up Code Coverage, hooking require so that instrumented code is returned
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let self = this
        self.instrumenter = new istanbul.Instrumenter({ coverageVariable: self.coverageVar })
        let sourceRoot = path.join(self.testsRoot, self.options.relativeSourcePath)

        // Glob source files
        let srcFiles = glob.sync('**/**.js', {
            cwd: sourceRoot,
            ignore: self.options.ignorePatterns,
        })

        // Create a match function - taken from the run-with-cover.js in istanbul.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        let decache = require('decache')
        let fileMap = {}
        srcFiles.forEach(file => {
            let fullPath = path.join(sourceRoot, file)
            // @ts-ignore - Implicit any
            fileMap[fullPath] = true

            if (os.platform() === 'win32') {
                ;(fileMap as any)[fullPath.toLowerCase()] = true
            }

            // On Windows, extension is loaded pre-test hooks and this mean we lose
            // our chance to hook the Require call. In order to instrument the code
            // we have to decache the JS file so on next load it gets instrumented.
            // This doesn"t impact tests, but is a concern if we had some integration
            // tests that relied on VSCode accessing our module since there could be
            // some shared global state that we lose.
            decache(fullPath)
        })

        self.matchFn = (file: string): boolean => {
            let fileIsInMap: boolean = !!(fileMap as any)[file]
            if (os.platform() === 'win32') {
                fileIsInMap = fileIsInMap || !!(fileMap as any)[file.toLowerCase()]
            }
            return fileIsInMap
        }
        self.matchFn.files = Object.keys(fileMap)

        // Hook up to the Require function so that when this is called, if any of our source files
        // are required, the instrumented version is pulled in instead. These instrumented versions
        // write to a global coverage variable with hit counts whenever they are accessed
        self.transformer = self.instrumenter.instrumentSync.bind(self.instrumenter)
        let hookOpts = { verbose: false, extensions: ['.js'] }
        istanbul.hook.hookRequire(self.matchFn, self.transformer, hookOpts)

        // initialize the global variable to stop mocha from complaining about leaks
        // @ts-ignore - Implicit any
        global[self.coverageVar] = {}

        // Hook the process exit event to handle reporting
        // Only report coverage if the process is exiting successfully
        // @ts-ignore - Implicit any
        process.on('exit', code => {
            self.reportCoverage()
        })
    }

    /**
     * Writes a coverage report. Note that as this is called in the process exit callback, all calls must be synchronous.
     *
     * @returns {void}
     *
     * @memberOf CoverageRunner
     */
    public reportCoverage(): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        let self = this
        istanbul.hook.unhookRequire()
        let cov: any
        // @ts-ignore - Implicit any
        if (typeof global[self.coverageVar] === 'undefined' || Object.keys(global[self.coverageVar]).length === 0) {
            console.error('No coverage information was collected, exit without writing coverage information')
            return
        } else {
            // @ts-ignore - Implicit any
            cov = global[self.coverageVar]
        }

        // TODO consider putting this under a conditional flag
        // Files that are not touched by code ran by the test runner is manually instrumented, to
        // illustrate the missing coverage.
        // @ts-ignore - Implicit any
        self.matchFn.files.forEach(file => {
            try {
                if (!cov[file]) {
                    console.log(file)
                    self.transformer(fs.readFileSync(file, 'utf-8'), file)

                    // When instrumenting the code, istanbul will give each FunctionDeclaration a value of 1 in coverState.s,
                    // presumably to compensate for function hoisting. We need to reset this, as the function was not hoisted,
                    // as it was never loaded.
                    Object.keys(self.instrumenter.coverState.s).forEach(key => {
                        self.instrumenter.coverState.s[key] = 0
                    })

                    cov[file] = self.instrumenter.coverState
                }
            } catch (e) {
                console.error(e)
            }
        })

        // TODO Allow config of reporting directory with
        let reportingDir = path.join(self.testsRoot, self.options.relativeCoverageDir)
        let includePid = self.options.includePid
        let pidExt = includePid ? '-' + process.pid : ''
        let coverageFile = path.resolve(reportingDir, 'coverage' + pidExt + '.json')

        _mkDirIfExists(reportingDir) // yes, do this again since some test runners could clean the dir initially created

        fs.writeFileSync(coverageFile, JSON.stringify(cov), 'utf8')

        let remappedCollector = remapIstanbul.remap(cov, {
            // @ts-ignore - Implicit any
            warn: warning => {
                // We expect some warnings as any JS file without a typescript mapping will cause this.
                // By default, we"ll skip printing these to the console as it clutters it up
                if (self.options.verbose) {
                    console.warn(warning)
                }
            },
        })

        let reporter = new istanbul.Reporter(undefined, reportingDir)
        let reportTypes = self.options.reports instanceof Array ? self.options.reports : ['lcov']
        reporter.addAll(reportTypes)
        reporter.write(remappedCollector, true, () => {
            console.log(`Code coverage reports written to ${reportingDir}`)
        })
    }
}

function _mkDirIfExists(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir)
    }
}

interface TestRunnerOptions {
    enabled?: boolean
    relativeCoverageDir: string
    relativeSourcePath: string
    ignorePatterns: string[]
    includePid?: boolean
    reports?: string[]
    verbose?: boolean
}

function _readCoverOptions(testsRoot: string): TestRunnerOptions {
    let coverConfigPath = path.join(testsRoot, '..', '..', 'coverconfig.json')
    // @ts-ignore - Type 'undefined' not assignable
    let coverConfig: ITestRunnerOptions = undefined
    if (fs.existsSync(coverConfigPath)) {
        let configContent = fs.readFileSync(coverConfigPath, 'utf-8')
        coverConfig = JSON.parse(configContent)
    }
    return coverConfig
}
