/* tslint:disable:file-header */ // 2018-10-05: Amazon addition (this line only).
/*!
 * MIT License for this file sourced from
 * https://github.com/codecov/example-typescript-vscode-extension/blob/master/LICENSE
 *
 * Copyright (c) 2017 Nikita Gryzlov <nixel2007@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Portions Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 */

// 2018-10-05: Amazon addition.
/* tslint:disable */
// END 2018-10-05: Amazon addition.
"use strict";

import * as fs from "fs";
import * as glob from "glob";
// 2018-10-05: Amazon addition.
import * as os from "os"
// END 2018-10-05: Amazon addition.
import * as paths from "path";

// 2020-02-05: Amazon addition.
import { MochaOptions } from "mocha";
import { resolve } from "path";
// END 2020-02-05: Amazon addition.

const istanbul = require("istanbul");
const Mocha = require("mocha");
const remapIstanbul = require("remap-istanbul");

// Linux: prevent a weird NPE when mocha on Linux requires the window size from the TTY
// Since we are not running in a tty environment, we just implementt he method statically
const tty = require("tty");
if (!tty.getWindowSize) {
    tty.getWindowSize = (): number[] => {
        return [80, 75];
    };
}

// 2020-02-05: Amazon addition.
export function defaultMochaOptions(useColors: boolean = true): MochaOptions {
    const outputFile = resolve(process.env["TEST_REPORT_DIR"] || ".test-reports", "report.xml")
    const o: MochaOptions = {
        ui: "bdd",
        reporter: "mocha-multi-reporters",
        reporterOptions: {
            reporterEnabled: "mocha-junit-reporter, spec",
            mochaJunitReporterReporterOptions: {
                mochaFile: outputFile
            }
        }
    }
    ;(o as any).color = useColors
    return o
}

let mocha = new Mocha(defaultMochaOptions());
// END 2020-02-05: Amazon addition.

// 2018-10-05: Amazon addition.
// @ts-ignore - Implicit any
// END 2018-10-05: Amazon addition.
function configure(mochaOpts): void {
    mocha = new Mocha(mochaOpts);
}
exports.configure = configure;

function _mkDirIfExists(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

function _readCoverOptions(testsRoot: string): ITestRunnerOptions {
    // 2018-10-05: Amazon addition. (Modified the path to coverconfig, added ts-ignore)
    let coverConfigPath = paths.join(testsRoot, "..", "..", "..", "coverconfig.json");
    // @ts-ignore - Type 'undefined' not assignable
    // END 2018-10-05: Amazon addition.
    let coverConfig: ITestRunnerOptions = undefined;
    if (fs.existsSync(coverConfigPath)) {
        let configContent = fs.readFileSync(coverConfigPath, "utf-8");
        coverConfig = JSON.parse(configContent);
    }
    return coverConfig;
}

// 2018-10-05: Amazon addition.
// @ts-ignore - Implicit any
// END 2018-10-05: Amazon addition.
function run(testsRoot, clb): any {
    // Enable source map support
    require("source-map-support").install();

    // Read configuration for the coverage file
    let coverOptions: ITestRunnerOptions = _readCoverOptions(testsRoot);
    if (coverOptions && coverOptions.enabled) {
        // Setup coverage pre-test, including post-test hook to report
        let coverageRunner = new CoverageRunner(coverOptions, testsRoot, clb);
        coverageRunner.setupCoverage();
    }

    // 2020-03-24: Amazon addition.
    // VSCode refuses to unset this value, so it gets set for each task and null is converted to a string
    const testFile = process.env["TEST_FILE"] === 'null' ? undefined : process.env["TEST_FILE"]
    const testFilePath = testFile?.replace(/^src\/test\//, "")?.concat('.js')

    const globalSetupPath = paths.join(testsRoot, 'globalSetup.test.js')
    if (testFilePath && fs.existsSync(globalSetupPath)) {
        // XXX: explicitly add globalSetup, other tests depend on it.
        mocha.addFile(globalSetupPath);
    }

    // Glob test files
    glob(testFilePath ?? "**/**.test.js", { cwd: testsRoot }, (error, files): any => {
        // END 2020-03-24: Amazon addition.
        if (error) {
            return clb(error);
        }
        try {
            // Fill into Mocha
            files.forEach((f): Mocha => {
                return mocha.addFile(paths.join(testsRoot, f));
            });
            // Run the tests
            let failureCount = 0;

            mocha.run()
                // 2018-10-05: Amazon addition.
                // @ts-ignore - Implicit any
                // END 2018-10-05: Amazon addition.
                .on("fail", (test, err): void => {
                    failureCount++;
                })
                .on("end", (): void => {
                    clb(undefined, failureCount);
                });
        } catch (error) {
            return clb(error);
        }
    });
}
exports.run = run;

interface ITestRunnerOptions {
    enabled?: boolean;
    relativeCoverageDir: string;
    relativeSourcePath: string;
    ignorePatterns: string[];
    includePid?: boolean;
    reports?: string[];
    verbose?: boolean;
}

class CoverageRunner {

    private coverageVar: string = "$$cov_" + new Date().getTime() + "$$";
    private transformer: any = undefined;
    private matchFn: any = undefined;
    private instrumenter: any = undefined;

    // 2018-10-05: Amazon addition.
    // @ts-ignore - endRunCallback declared but not used
    // END 2018-10-05: Amazon addition.
    constructor(private options: ITestRunnerOptions, private testsRoot: string, private endRunCallback: any) {
        if (!options.relativeSourcePath) {
            return endRunCallback("Error - relativeSourcePath must be defined for code coverage to work");
        }

    }

    public setupCoverage(): void {
        // Set up Code Coverage, hooking require so that instrumented code is returned
        let self = this;
        self.instrumenter = new istanbul.Instrumenter({ coverageVariable: self.coverageVar });
        let sourceRoot = paths.join(self.testsRoot, self.options.relativeSourcePath);

        // Glob source files
        let srcFiles = glob.sync("**/**.js", {
            cwd: sourceRoot,
            ignore: self.options.ignorePatterns,
        });

        // Create a match function - taken from the run-with-cover.js in istanbul.
        let decache = require("decache");
        let fileMap = {};
        srcFiles.forEach((file) => {
            let fullPath = paths.join(sourceRoot, file);
            // 2018-10-05: Amazon addition.
            // @ts-ignore - Implicit any
            // END 2018-10-05: Amazon addition.
            fileMap[fullPath] = true;

            // 2018-10-05: Amazon addition.
            if (os.platform() === 'win32') {
                (fileMap as any)[fullPath.toLowerCase()] = true
            }
            // END 2018-10-05: Amazon addition.

            // On Windows, extension is loaded pre-test hooks and this mean we lose
            // our chance to hook the Require call. In order to instrument the code
            // we have to decache the JS file so on next load it gets instrumented.
            // This doesn"t impact tests, but is a concern if we had some integration
            // tests that relied on VSCode accessing our module since there could be
            // some shared global state that we lose.
            decache(fullPath);
        });

        // 2018-10-05: Amazon addition. (modify matchFn for case insensitive check)
        self.matchFn = (file: string): boolean => {
            let fileIsInMap: boolean = !!(fileMap as any)[file]
            if (os.platform() === 'win32') {
                fileIsInMap = fileIsInMap || !!(fileMap as any)[file.toLowerCase()]
            }
            return fileIsInMap
        }
        // END 2018-10-05: Amazon addition.
        self.matchFn.files = Object.keys(fileMap);

        // Hook up to the Require function so that when this is called, if any of our source files
        // are required, the instrumented version is pulled in instead. These instrumented versions
        // write to a global coverage variable with hit counts whenever they are accessed
        self.transformer = self.instrumenter.instrumentSync.bind(self.instrumenter);
        let hookOpts = { verbose: false, extensions: [".js"] };
        istanbul.hook.hookRequire(self.matchFn, self.transformer, hookOpts);

        // initialize the global variable to stop mocha from complaining about leaks
        // 2018-10-05: Amazon addition.
        // @ts-ignore - Implicit any
        // END 2018-10-05: Amazon addition.
        global[self.coverageVar] = {};

        // Hook the process exit event to handle reporting
        // Only report coverage if the process is exiting successfully
        // 2018-10-05: Amazon addition.
        // @ts-ignore - Implicit any
        // END 2018-10-05: Amazon addition.
        process.on("exit", (code) => {
            self.reportCoverage();
        });
    }

    /**
     * Writes a coverage report. Note that as this is called in the process exit callback, all calls must be synchronous.
     *
     * @returns {void}
     *
     * @memberOf CoverageRunner
     */
    public reportCoverage(): void {
        let self = this;
        istanbul.hook.unhookRequire();
        let cov: any;
        // 2018-10-05: Amazon addition.
        // @ts-ignore - Implicit any
        // END 2018-10-05: Amazon addition.
        if (typeof global[self.coverageVar] === "undefined" || Object.keys(global[self.coverageVar]).length === 0) {
            console.error("No coverage information was collected, exit without writing coverage information");
            return;
        } else {
            // 2018-10-05: Amazon addition.
            // @ts-ignore - Implicit any
            // END 2018-10-05: Amazon addition.
            cov = global[self.coverageVar];
        }

        // TODO consider putting this under a conditional flag
        // Files that are not touched by code ran by the test runner is manually instrumented, to
        // illustrate the missing coverage.
        // 2018-10-05: Amazon addition.
        // @ts-ignore - Implicit any
        // END 2018-10-05: Amazon addition.
        self.matchFn.files.forEach((file) => {
            if (!cov[file]) {
                self.transformer(fs.readFileSync(file, "utf-8"), file);

                // When instrumenting the code, istanbul will give each FunctionDeclaration a value of 1 in coverState.s,
                // presumably to compensate for function hoisting. We need to reset this, as the function was not hoisted,
                // as it was never loaded.
                Object.keys(self.instrumenter.coverState.s).forEach((key) => {
                    self.instrumenter.coverState.s[key] = 0;
                });

                cov[file] = self.instrumenter.coverState;
            }
        });

        // TODO Allow config of reporting directory with
        let reportingDir = paths.join(self.testsRoot, self.options.relativeCoverageDir);
        let includePid = self.options.includePid;
        let pidExt = includePid ? ("-" + process.pid) : "";
        let coverageFile = paths.resolve(reportingDir, "coverage" + pidExt + ".json");

        _mkDirIfExists(reportingDir); // yes, do this again since some test runners could clean the dir initially created

        fs.writeFileSync(coverageFile, JSON.stringify(cov), "utf8");

        let remappedCollector = remapIstanbul.remap(cov, {
            // 2018-10-05: Amazon addition.
            // @ts-ignore - Implicit any
            // END 2018-10-05: Amazon addition.
            warn: warning => {
                // We expect some warnings as any JS file without a typescript mapping will cause this.
                // By default, we"ll skip printing these to the console as it clutters it up
                if (self.options.verbose) {
                    console.warn(warning);
                }
            }
        });

        let reporter = new istanbul.Reporter(undefined, reportingDir);
        let reportTypes = (self.options.reports instanceof Array) ? self.options.reports : ["lcov"];
        reporter.addAll(reportTypes);
        reporter.write(remappedCollector, true, () => {
            // 2018-10-05: Amazon addition. (Modified log output)
            console.log(`Code coverage reports written to ${reportingDir}`);
            // END 2018-10-05: Amazon addition.
        });
    }
}

// 2019-12-05: Amazon addition. (export declarations - runTests)
export const runTests = (testsRoot: string, clb: (err: any, failedTests: number) => void): void => run(testsRoot, clb)
// END 2019-12-05: Amazon addition. (export declarations - runTests)
// 2020-01-08: Amazon addition. (export declarations - configureMocha)
export const configureMocha = (mochaOpts: any) => configure(mochaOpts)
// END 2020-01-08: Amazon addition. (export declarations - configureMocha)
