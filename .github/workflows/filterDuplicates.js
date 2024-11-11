const fs = require('fs/promises')

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

    return fileChanges
}

function doesOverlap(range1, range2) {
    const [start1, end1] = range1
    const [start2, end2] = range2
    return (start1 >= start2 && start1 <= end2) || (end1 >= start2 && end1 <= end2)
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

async function main() {
    const rawDiffPath = process.argv[2]
    const jscpdReportPath = process.argv[3]
    const changes = await parseDiff(rawDiffPath)
    const jscpdReport = JSON.parse(await fs.readFile(jscpdReportPath, 'utf8'))
    const filteredDuplicates = filterDuplicates(jscpdReport, changes)

    console.log(filteredDuplicates)
    console.log('%s files changes', changes.size)
    console.log('%s duplicates found', filteredDuplicates.length)
    if (filteredDuplicates.length > 0) {
        process.exit(1)
    }
}

void main()
