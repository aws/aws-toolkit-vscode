/**
 * Filters the report produced by jscpd to only include clones that involve changes from the given git diff.
 * If the filtered report is non-empty, i.e. there exists a clone in the changes,
 * the program exits with an error and logs the filtered report to console.
 *
 * Usage:
 *      node filterDuplicates.js run [path_to_git_diff] [path_to_jscpd_report] [commit_hash] [repo_name]
 *
 * Tests:
 *      node filterDuplicates.js test
 */

const fs = require('fs/promises')
const path = require('path')

function parseDiffFilePath(filePathLine) {
    return filePathLine.split(' ')[2].split('/').slice(1).join('/')
}

function parseDiffRange(rangeLine) {
    const [_fromRange, toRange] = rangeLine.split(' ').slice(1, 3)
    const [startLine, numLines] = toRange.slice(1).split(',').map(Number)
    const range = [startLine, startLine + numLines]
    return range
}

async function parseDiff(diffPath) {
    const diff = await fs.readFile(diffPath, 'utf8')
    const lines = diff.split('\n')
    let currentFile = null
    let currentFileChanges = []
    const fileChanges = new Map()

    for (const line of lines) {
        if (line.startsWith('diff')) {
            if (currentFile) {
                fileChanges.set(currentFile, currentFileChanges)
            }
            currentFile = parseDiffFilePath(line)
            currentFileChanges = []
        }
        if (line.startsWith('@@')) {
            currentFileChanges.push(parseDiffRange(line))
        }
    }

    fileChanges.set(currentFile, currentFileChanges)

    return fileChanges
}

function doesOverlap(range1, range2) {
    const [start1, end1] = range1
    const [start2, end2] = range2
    return (
        (start1 >= start2 && start1 <= end2) || (end1 >= start2 && end1 <= end2) || (start2 >= start1 && end2 <= end1)
    )
}

function isCloneInChanges(changes, cloneInstance) {
    const fileName = cloneInstance.name
    const cloneStart = cloneInstance.start
    const cloneEnd = cloneInstance.end
    const lineChangeRanges = changes.get(fileName)

    if (!lineChangeRanges) {
        return false
    }

    return lineChangeRanges.some((range) => doesOverlap([cloneStart, cloneEnd], range))
}

function isInChanges(changes, dupe) {
    return isCloneInChanges(changes, dupe.firstFile) || isCloneInChanges(changes, dupe.secondFile)
}

function filterDuplicates(report, changes) {
    duplicates = []
    for (const dupe of report.duplicates) {
        if (isInChanges(changes, dupe)) {
            duplicates.push(dupe)
        }
    }
    return duplicates
}

function formatDuplicates(duplicates, commitHash, repoName) {
    const baseUrl = `https://github.com/${repoName}`
    return duplicates.map((dupe) => {
        return {
            first: formUrl(dupe.firstFile, commitHash),
            second: formUrl(dupe.secondFile, commitHash),
            numberOfLines: dupe.lines,
        }
    })
    function formUrl(file, commitHash) {
        return `${baseUrl}/blob/${commitHash}/${file.name}#L${file.start}-L${file.end}`
    }
}

async function run() {
    const rawDiffPath = process.argv[3]
    const jscpdReportPath = process.argv[4]
    const commitHash = process.argv[5]
    const repoName = process.argv[6]
    const changes = await parseDiff(rawDiffPath)
    const jscpdReport = JSON.parse(await fs.readFile(jscpdReportPath, 'utf8'))
    const filteredDuplicates = filterDuplicates(jscpdReport, changes)

    console.log('%s files changes', changes.size)
    console.log('%s duplicates found', filteredDuplicates.length)
    if (filteredDuplicates.length > 0) {
        console.log(formatDuplicates(filteredDuplicates, commitHash, repoName))
        console.log(
            '* Hint: if these duplicates appear unrelated to the changes, rebase onto the latest target branch.'
        )
        process.exit(1)
    }
}

/**
 * Mini-test Suite
 */
const testDiffFile = path.resolve(__dirname, 'test/test_diff.txt')
let testCounter = 0
function assertEqual(actual, expected) {
    if (actual !== expected) {
        throw new Error(`Expected ${expected} but got ${actual}`)
    }
    testCounter += 1
}

async function test() {
    test_parseDiffFilePath()
    test_parseDiffRange()
    test_doesOverlap()
    await test_parseDiff()
    await test_isCloneInChanges()
    await test_isInChanges()
    await test_filterDuplicates()
    console.log('All tests passed (%s)', testCounter)
}

function test_parseDiffFilePath() {
    assertEqual(
        parseDiffFilePath(
            'diff --git a/.github/workflows/copyPasteDetection.yml b/.github/workflows/copyPasteDetection.yml'
        ),
        '.github/workflows/copyPasteDetection.yml'
    )
    assertEqual(
        parseDiffFilePath('diff --git a/.github/workflows/filterDuplicates.js b/.github/workflows/filterDuplicates.js'),
        '.github/workflows/filterDuplicates.js'
    )
}

function test_parseDiffRange() {
    assertEqual(parseDiffRange('@@ -1,4 +1,4 @@').join(','), '1,5')
    assertEqual(parseDiffRange('@@ -10,4 +10,4 @@').join(','), '10,14')
    assertEqual(parseDiffRange('@@ -10,4 +10,5 @@').join(','), '10,15')
}

function test_doesOverlap() {
    assertEqual(doesOverlap([1, 5], [2, 4]), true)
    assertEqual(doesOverlap([2, 3], [2, 4]), true)
    assertEqual(doesOverlap([2, 3], [1, 4]), true)
    assertEqual(doesOverlap([1, 5], [5, 6]), true)
    assertEqual(doesOverlap([1, 5], [6, 7]), false)
    assertEqual(doesOverlap([6, 7], [1, 5]), false)
    assertEqual(doesOverlap([2, 5], [4, 5]), true)
}

async function test_parseDiff() {
    const changes = await parseDiff(testDiffFile)
    assertEqual(changes.size, 2)
    assertEqual(changes.get('.github/workflows/copyPasteDetection.yml').length, 1)
    assertEqual(changes.get('.github/workflows/filterDuplicates.js').length, 1)
    assertEqual(changes.get('.github/workflows/filterDuplicates.js')[0].join(','), '1,86')
    assertEqual(changes.get('.github/workflows/copyPasteDetection.yml')[0].join(','), '26,73')
}

async function test_isCloneInChanges() {
    const changes = await parseDiff(testDiffFile)
    assertEqual(
        isCloneInChanges(changes, {
            name: '.github/workflows/filterDuplicates.js',
            start: 1,
            end: 86,
        }),
        true
    )
    assertEqual(
        isCloneInChanges(changes, {
            name: '.github/workflows/filterDuplicates.js',
            start: 80,
            end: 95,
        }),
        true
    )
    assertEqual(
        isCloneInChanges(changes, {
            name: '.github/workflows/filterDuplicates.js',
            start: 87,
            end: 95,
        }),
        false
    )
    assertEqual(
        isCloneInChanges(changes, {
            name: 'some-fake-file',
            start: 1,
            end: 100,
        }),
        false
    )
}

async function test_isInChanges() {
    const changes = await parseDiff(testDiffFile)
    const dupe = {
        firstFile: {
            name: '.github/workflows/filterDuplicates.js',
            start: 1,
            end: 86,
        },
        secondFile: {
            name: '.github/workflows/filterDuplicates.js',
            start: 80,
            end: 95,
        },
    }
    assertEqual(isInChanges(changes, dupe), true)
    dupe.secondFile.start = 87
    assertEqual(isInChanges(changes, dupe), true)
    dupe.firstFile.name = 'some-fake-file'
    assertEqual(isInChanges(changes, dupe), false)
}

async function test_filterDuplicates() {
    assertEqual(
        filterDuplicates(
            {
                duplicates: [
                    {
                        firstFile: {
                            name: '.github/workflows/filterDuplicates.js',
                            start: 1,
                            end: 86,
                        },
                        secondFile: {
                            name: '.github/workflows/filterDuplicates.js',
                            start: 80,
                            end: 95,
                        },
                    },
                ],
            },
            await parseDiff(testDiffFile)
        ).length,
        1
    )
    assertEqual(
        filterDuplicates(
            {
                duplicates: [
                    {
                        firstFile: {
                            name: 'some-other-file',
                            start: 1,
                            end: 86,
                        },
                        secondFile: {
                            name: '.github/workflows/filterDuplicates.js',
                            start: 90,
                            end: 95,
                        },
                    },
                ],
            },
            await parseDiff(testDiffFile)
        ).length,
        0
    )
}

async function main() {
    const mode = process.argv[2]
    if (mode === 'run') {
        await run()
    } else if (mode === 'test') {
        await test()
    } else {
        throw new Error('Invalid mode')
    }
}

void main()
