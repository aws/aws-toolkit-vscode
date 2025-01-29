/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as xml2js from 'xml2js'

interface TestFailure {
    $: {
        message: string
    }
    _: string
}

interface TestCase {
    $: {
        classname: string
        name: string
        time: string
    }
    failure?: TestFailure[]
}

interface TestSuite {
    $: {
        name: string
        tests: string
        failures: string
        errors: string
        time: string
        file: string
    }
    testcase: TestCase[] | undefined
}

interface TestReport {
    testsuites: {
        testsuite: TestSuite[]
    }
}

interface TestSummary {
    totalTests: number
    totalFailures: number
    totalTime: number
    failedTests: FailedTest[]
}

interface FailedTest {
    suite: string
    test: string
    message: string
    contents: string
    path: string[]
}

/**
 * Merge all of the packages/ test reports into a single directory
 */
async function createTestReport() {
    console.log('Merging test reports')

    const packagesDir = `${__dirname}/../packages`

    // Get all packages/* directories
    const packageDirs = fs.readdirSync(packagesDir).map((dir) => `${packagesDir}/${dir}`)

    // Find report.xml files in .test-reports subdirectories
    const testReports = packageDirs
        .map((dir) => `${dir}/.test-reports/report.xml`)
        .filter((file) => fs.existsSync(file))

    const mergedReport: TestReport = {
        testsuites: {
            testsuite: [],
        },
    }

    const failedTests: FailedTest[] = []
    let totalTests = 0
    let totalFailures = 0
    let totalTime = 0

    let filePath = ''
    let suites = new Set<string>()

    /**
     * Collect all test reports into a single merged test report object.
     * Also keeps track of test count, test failures, and test run time
     */
    for (const file of testReports) {
        const content = fs.readFileSync(file)
        const result: { testsuites: { testsuite: TestSuite[] } } = await xml2js.parseStringPromise(content)
        if (result.testsuites && result.testsuites.testsuite) {
            for (const suite of result.testsuites.testsuite) {
                if (suite.$.file !== filePath) {
                    filePath = suite.$.file
                    suites = new Set<string>()
                }

                for (const testcase of suite.testcase ?? []) {
                    if (testcase.failure) {
                        const testPath = parseTestHierarchy(suites, testcase.$.classname, suite.$.name, testcase.$.name)
                        failedTests.push({
                            suite: suite.$.name,
                            test: testcase.$.name,
                            message: testcase.failure[0].$.message,
                            contents: testcase.failure[0]._,
                            path: testPath,
                        })
                    }
                }

                totalTests += parseInt(suite.$.tests, 10)
                totalFailures += parseInt(suite.$.failures, 10)
                totalTime += parseFloat(suite.$.time)

                suites.add(suite.$.name)
            }

            mergedReport.testsuites.testsuite.push(...result.testsuites.testsuite)
        }
    }

    printTestSummary({
        totalTests,
        totalFailures,
        totalTime,
        failedTests,
    })

    writeReport(mergedReport)
}

/**
 * Extracts and constructs a hierarchical test path from a test case identifier
 *
 * @param suites - Set of known test suite names
 * @param className - Name of the test class
 * @param suiteName - Name of the test suite
 * @param testcaseName - Full name of the test case
 * @example
 * parseTestHierarchy(new Set(["package validations"]), 'bar1', 'foo', 'package validations foo bar1') -> ["package validations", "bar1", "foo"]
 * @returns An array of path components representing the test hierarchy
 */
function parseTestHierarchy(suites: Set<string>, className: string, suiteName: string, testcaseName: string) {
    let remainingPath = testcaseName
    remainingPath = remainingPath.substring(0, remainingPath.lastIndexOf(className))
    remainingPath = remainingPath.substring(0, remainingPath.lastIndexOf(suiteName))

    const pathComponents = remainingPath.trim().split(' ')
    let index = 0
    let currentComponent = pathComponents[0]
    const path = []
    while (remainingPath.length > 0) {
        index++
        if (!suites.has(currentComponent)) {
            currentComponent = currentComponent + ' ' + pathComponents[index]
        } else {
            path.push(currentComponent)
            remainingPath = remainingPath.substring(currentComponent.length).trim()
            currentComponent = pathComponents[index]
        }
    }

    path.push(suiteName)
    path.push(className)

    return path
}

function printTestSummary({ totalTests, totalFailures, totalTime, failedTests }: TestSummary) {
    const passingTests = totalTests - totalFailures
    const pendingTests = 0

    console.log(`${passingTests} passing (${Math.round(totalTime)}s)`)
    if (pendingTests > 0) {
        console.log(`${pendingTests} pending`)
    }
    if (totalFailures > 0) {
        console.log(`${totalFailures} failing`)

        failedTests.forEach((test, index) => {
            let indent = '  '

            for (let x = 0; x < test.path.length; x++) {
                if (x == 0) {
                    console.log(`${indent}${index + 1}) ${test.path[x]}`)
                    indent += '   '
                } else {
                    console.log(`${indent}${test.path[x]}`)
                }
                indent += '  '
            }

            if (test.contents) {
                // Indent the stack trace
                console.log(
                    test.contents
                        .split('\n')
                        .map((line) => `${indent}${line}`)
                        .join('\n')
                )
            }
            console.log() // Add empty line between failures
        })
    }
}

function writeReport(mergedReport: TestReport) {
    const builder = new xml2js.Builder()
    const xml = builder.buildObject(mergedReport)

    /**
     * Create the new test reports directory and write the test report
     */
    const reportsDir = `${__dirname}/../.test-reports`

    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true })
    }

    fs.writeFileSync(`${reportsDir}/report.xml`, xml)

    const exitCodeArg = process.argv[2]
    if (exitCodeArg) {
        /**
         * Retrieves the exit code from the previous test run execution.
         *
         * This allows us to:
         * 1. Merge and upload test reports regardless of the test execution status
         * 2. Preserve the original test run exit code
         * 3. Report the test status back to CI
         */
        const exitCode = parseInt(exitCodeArg || '0', 10)
        process.exit(exitCode)
    }
}

createTestReport()
