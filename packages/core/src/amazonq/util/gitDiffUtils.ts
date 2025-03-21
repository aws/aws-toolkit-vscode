/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'path'
import { CodeWhispererConstants } from '../../codewhisperer/indexNode'
import { ChildProcess, ChildProcessOptions } from '../../shared/utilities/processUtils'
import { getLogger } from '../../shared/logger/logger'
import { removeAnsi } from '../../shared/utilities/textUtilities'

interface GitDiffOptions {
    projectPath: string
    projectName: string
    filepath?: string
    scope?: CodeWhispererConstants.CodeAnalysisScope
}

export async function getGitDiffContent(
    projectPaths: string[],
    filepath?: string,
    scope?: CodeWhispererConstants.CodeAnalysisScope
) {
    let gitDiffContent = ''
    for (const projectPath of projectPaths) {
        const projectName = path.basename(projectPath)
        // Get diff content
        gitDiffContent += await executeGitDiff({
            projectPath,
            projectName,
            filepath,
            scope,
        })
    }
    return gitDiffContent
}

async function executeGitDiff(options: GitDiffOptions): Promise<string> {
    const { projectPath, projectName, filepath: filePath, scope } = options
    const isProjectScope = scope === CodeWhispererConstants.CodeAnalysisScope.PROJECT

    const untrackedFilesString = await getGitUntrackedFiles(projectPath)
    const untrackedFilesArray = untrackedFilesString?.trim()?.split('\n')?.filter(Boolean)

    if (isProjectScope && untrackedFilesArray && !untrackedFilesArray.length) {
        return await generateHeadDiff(projectPath, projectName)
    }

    let diffContent = ''

    if (isProjectScope) {
        diffContent = await generateHeadDiff(projectPath, projectName)

        if (untrackedFilesArray) {
            const untrackedDiffs = await Promise.all(
                untrackedFilesArray.map((file) => generateNewFileDiff(projectPath, projectName, file))
            )
            diffContent += untrackedDiffs.join('')
        }
    } else if (!isProjectScope && filePath) {
        const relativeFilePath = path.relative(projectPath, filePath)

        const newFileDiff = await generateNewFileDiff(projectPath, projectName, relativeFilePath)
        diffContent = rewriteDiff(newFileDiff)
    }
    return diffContent
}

async function getGitUntrackedFiles(projectPath: string): Promise<string | undefined> {
    const checkNewFileArgs = ['ls-files', '--others', '--exclude-standard']
    const checkProcess = new ChildProcess('git', checkNewFileArgs)

    try {
        let output = ''
        await checkProcess.run({
            rejectOnError: true,
            rejectOnErrorCode: true,
            onStdout: (text) => {
                output += text
            },
            spawnOptions: {
                cwd: projectPath,
            },
        })
        return output
    } catch (err) {
        getLogger().warn(`Failed to check if file is new: ${err}`)
        return undefined
    }
}

async function generateHeadDiff(projectPath: string, projectName: string, relativePath?: string): Promise<string> {
    let diffContent = ''

    const gitArgs = [
        'diff',
        'HEAD',
        `--src-prefix=a/${projectName}/`,
        `--dst-prefix=b/${projectName}/`,
        ...(relativePath ? [relativePath] : []),
    ]

    const childProcess = new ChildProcess('git', gitArgs)

    const runOptions: ChildProcessOptions = {
        rejectOnError: true,
        rejectOnErrorCode: true,
        onStdout: (text) => {
            diffContent += text
            getLogger().verbose(removeAnsi(text))
        },
        onStderr: (text) => {
            getLogger().error(removeAnsi(text))
        },
        spawnOptions: {
            cwd: projectPath,
        },
    }

    try {
        await childProcess.run(runOptions)
        return diffContent
    } catch (err) {
        getLogger().warn(`Failed to run command \`${childProcess.toString()}\`: ${err}`)
        return ''
    }
}

async function generateNewFileDiff(projectPath: string, projectName: string, relativePath: string): Promise<string> {
    let diffContent = ''

    const gitArgs = [
        'diff',
        '--no-index',
        `--src-prefix=a/${projectName}/`,
        `--dst-prefix=b/${projectName}/`,
        '/dev/null', // Use /dev/null as the old file
        relativePath,
    ]

    const childProcess = new ChildProcess('git', gitArgs)
    const runOptions: ChildProcessOptions = {
        rejectOnError: false,
        rejectOnErrorCode: false,
        onStdout: (text) => {
            diffContent += text
            getLogger().verbose(removeAnsi(text))
        },
        onStderr: (text) => {
            getLogger().error(removeAnsi(text))
        },
        spawnOptions: {
            cwd: projectPath,
        },
    }

    try {
        await childProcess.run(runOptions)
        return diffContent
    } catch (err) {
        getLogger().warn(`Failed to run diff command: ${err}`)
        return ''
    }
}

function rewriteDiff(inputStr: string): string {
    const lines = inputStr.split('\n')
    const rewrittenLines = lines.slice(0, 5).map((line) => {
        line = line.replace(/\\\\/g, '/')
        line = line.replace(/("a\/[^"]*)/g, (match, p1) => p1)
        line = line.replace(/("b\/[^"]*)/g, (match, p1) => p1)
        line = line.replace(/"/g, '')

        return line
    })
    const outputLines = [...rewrittenLines, ...lines.slice(5)]
    const outputStr = outputLines.join('\n')

    return outputStr
}
