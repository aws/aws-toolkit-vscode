/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as path from 'path'
import * as xml2js from 'xml2js'

/**
 * Merge all of the packages/ test reports into a single directory
 */
async function mergeReports() {
    console.log('Merging test reports')

    const packagesDir = path.join(__dirname, '..', 'packages')

    // Get all packages/* directories
    const packageDirs = fs.readdirSync(packagesDir).map((dir) => path.join(packagesDir, dir))

    // Find report.xml files in .test-reports subdirectories
    const testReports = packageDirs
        .map((dir) => path.join(dir, '.test-reports', 'report.xml'))
        .filter((file) => fs.existsSync(file))

    let mergedReport = {
        testsuites: {
            testsuite: [],
        },
    }

    // Collect all test reports into a single merged test report object
    for (const file of testReports) {
        const content = fs.readFileSync(file)
        const result: { testsuites: { testsuite: [] } } = await xml2js.parseStringPromise(content)
        if (result.testsuites && result.testsuites.testsuite) {
            mergedReport.testsuites.testsuite.push(...result.testsuites.testsuite)
        }
    }

    const builder = new xml2js.Builder()
    const xml = builder.buildObject(mergedReport)

    /**
     * Create the new test reports directory and write the test report
     */
    const reportsDir = path.join(__dirname, '..', '.test-reports')

    // Create reports directory if it doesn't exist
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true })
    }

    fs.writeFileSync(path.join(reportsDir, 'report.xml'), xml)
}

mergeReports()

/**
 * Grab the previous test runs exit code. This makes it so that merge and upload
 * the reports regardless of the test run exit code and then use the previous test
 * exit code to properly inform ci of the test run status
 */
const exitCode = parseInt(process.env.PREVIOUS_TEST_EXIT_CODE || '0', 10)
process.exit(exitCode)
