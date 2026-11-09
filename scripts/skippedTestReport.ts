/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Scans test files for skipped Mocha tests.
 *
 * It uses a regex instead of mocha's loader, because mocha's
 * loader can't resolve vscode by default
 *
 * Note: This script doesn't handle cases where teams use this.skip() inside of their tests
 *
 * Usage: node skippedTestReport.js <directoryPath>
 */

import * as fs from 'fs'
import * as path from 'path'

interface SkippedTest {
    file: string
    testName: string
    lineNumber: number
}

function findSkippedTests(directoryPath: string): SkippedTest[] {
    const skippedTests: SkippedTest[] = []

    const skipPatterns = [/\b(describe|it)\.skip\(['"`](.*?)['"`]/g]

    function searchInFile(filePath: string): void {
        try {
            const content = fs.readFileSync(filePath, 'utf8')
            const lines = content.split('\n')

            lines.forEach((line, index) => {
                for (const pattern of skipPatterns) {
                    const matches = line.matchAll(pattern)
                    for (const match of matches) {
                        skippedTests.push({
                            file: filePath,
                            testName: match[2],
                            lineNumber: index + 1,
                        })
                    }
                }
            })
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error)
        }
    }

    function visitDirectory(currentPath: string): void {
        const files = fs.readdirSync(currentPath)

        files.forEach((file) => {
            const fullPath = path.join(currentPath, file)
            const stat = fs.statSync(fullPath)

            if (stat.isDirectory()) {
                // Skip hidden directories
                if (!file.startsWith('.')) {
                    visitDirectory(fullPath)
                }
            } else if (stat.isFile() && file.endsWith('.ts')) {
                searchInFile(fullPath)
            }
        })
    }

    visitDirectory(directoryPath)
    return skippedTests
}

function main() {
    const targetDirectory = process.argv[2] || '.'

    try {
        const skippedTests = findSkippedTests(targetDirectory)

        if (skippedTests.length === 0) {
            console.log('No skipped tests found.')
            return
        }

        const testsByFile = skippedTests.reduce(
            (acc, test) => {
                const file = test.file
                if (!acc[file]) {
                    acc[file] = []
                }
                acc[file].push(test)
                return acc
            },
            {} as Record<string, SkippedTest[]>
        )

        console.log('\nSkipped Tests Report')
        console.log(`Total skipped tests: ${skippedTests.length}`)
        console.log(`Files affected: ${Object.keys(testsByFile).length}`)
        console.log('===================\n')

        Object.entries(testsByFile).forEach(([file, tests]) => {
            console.log(`📁 ${file}`)
            console.log('     Skipped tests:')
            tests.forEach((test) => {
                console.log(`      • ${test.testName} (line ${test.lineNumber})`)
            })
            console.log('')
        })
    } catch (error) {
        console.error('Error:', error)
        process.exit(1)
    }
}

main()
