/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-restricted-imports */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-case-declarations */
/* eslint-disable aws-toolkits/no-console-log */
/* eslint-disable unicorn/no-null */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { promisify } from 'util'
import * as chalk from 'chalk'
import { diffLines } from 'diff'
import * as prism from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import { Writable } from 'stream'

// Promisify fs functions
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)
const access = promisify(fs.access)

/**
 * Represents different types of output that can be returned
 */
export enum OutputKind {
    Text = 'text',
    Json = 'json',
}

/**
 * The output received from invoking a Tool
 */
export interface InvokeOutput {
    output: {
        kind: OutputKind
        content: string
    }
}

/**
 * Default InvokeOutput with empty text
 */
export function defaultInvokeOutput(): InvokeOutput {
    return {
        output: {
            kind: OutputKind.Text,
            content: '',
        },
    }
}

/**
 * Context for file operations and environment information
 */
export interface Context {
    fs: FileSystem
    env: EnvironmentProvider
}

/**
 * Environment provider interface
 */
export interface EnvironmentProvider {
    currentDir(): string
    home(): string
}

/**
 * Represents a stylized file with potential color formatting
 */
interface StylizedFile {
    truecolor: boolean
    content: string
    gutterBg: string
    lineBg: string
}

/**
 * Default implementation of StylizedFile
 */
function defaultStylizedFile(): StylizedFile {
    return {
        truecolor: false,
        content: '',
        gutterBg: '',
        lineBg: '',
    }
}

/**
 * Parameters for the FsWrite tool
 */
export type FsWriteParams =
    | { command: 'create'; path: string; file_text?: string; new_str?: string }
    | { command: 'str_replace'; path: string; old_str: string; new_str: string }
    | { command: 'insert'; path: string; insert_line: number; new_str: string }
    | { command: 'append'; path: string; new_str: string }

/**
 * Tool for writing to the filesystem
 */
export class FsWrite {
    private params: FsWriteParams

    constructor(params: FsWriteParams) {
        this.params = params
    }

    /**
     * Execute the file write operation
     * @param ctx Context for file operations
     * @param updates Writable stream to write updates to
     * @returns Promise resolving to the operation result
     */
    public async invoke(ctx: Context, updates: Writable): Promise<InvokeOutput> {
        const fs = ctx.fs
        const cwd = ctx.env.currentDir()

        switch (this.params.command) {
            case 'create': {
                const fileText = this.getCanonicalCreateCommandText()
                const filePath = sanitizePathToolArg(ctx, this.params.path)

                // Create parent directories if they don't exist
                const parentDir = path.dirname(filePath)
                if (parentDir) {
                    await mkdir(parentDir, { recursive: true })
                }

                const invokeDescription = (await fs.exists(filePath)) ? 'Replacing: ' : 'Creating: '

                updates.write(`${invokeDescription}${formatPath(cwd, filePath)}\n`)

                await writeToFile(ctx, filePath, fileText)
                return defaultInvokeOutput()
            }

            case 'str_replace': {
                console.log('debug read: ,,,,,', this.params.path)
                const filePath = sanitizePathToolArg(ctx, this.params.path)
                console.log('debug read: ,,,,,', filePath)
                const fileContent = (await readFile(filePath)).toString('utf-8')
                console.log('debug read: ,,,,,,', filePath)
                const matches = findAllOccurrences(fileContent, this.params.old_str)

                updates.write(`Updating: ${formatPath(cwd, filePath)}\n`)

                if (matches.length === 0) {
                    throw new Error(`No occurrences of "${this.params.old_str}" were found`)
                } else if (matches.length > 1) {
                    throw new Error(`${matches.length} occurrences of old_str were found when only 1 is expected`)
                } else {
                    const newContent = fileContent.replace(this.params.old_str, this.params.new_str)
                    await writeFile(filePath, newContent)
                    return defaultInvokeOutput()
                }
            }

            case 'insert': {
                const filePath = sanitizePathToolArg(ctx, this.params.path)
                let fileContent = (await fs.readFile(filePath)).toString('utf-8')

                updates.write(`Updating: ${formatPath(cwd, filePath)}\n`)

                // Get the index of the start of the line to insert at
                const lines = fileContent.split('\n')
                const numLines = lines.length
                const insertLine = Math.max(0, Math.min(this.params.insert_line, numLines))

                let insertIndex = 0
                for (let i = 0; i < insertLine; i++) {
                    insertIndex += (lines[i]?.length || 0) + 1 // +1 for the newline
                }

                fileContent = fileContent.slice(0, insertIndex) + this.params.new_str + fileContent.slice(insertIndex)
                await writeToFile(ctx, filePath, fileContent)
                return defaultInvokeOutput()
            }

            case 'append': {
                const filePath = sanitizePathToolArg(ctx, this.params.path)

                updates.write(`Appending to: ${formatPath(cwd, filePath)}\n`)

                let fileContent = (await fs.readFile(filePath)).toString('utf-8')
                if (!fileContent.endsWith('\n')) {
                    fileContent += '\n'
                }
                fileContent += this.params.new_str

                await writeToFile(ctx, filePath, fileContent)
                return defaultInvokeOutput()
            }
        }
    }

    /**
     * Print a description of the file write operation
     * @param ctx Context for file operations
     * @param updates Writable stream to write updates to
     */
    public async queueDescription(ctx: Context, updates: Writable): Promise<void> {
        const cwd = ctx.env.currentDir()
        await this.printRelativePath(ctx, updates)

        switch (this.params.command) {
            case 'create': {
                const fileText = this.getCanonicalCreateCommandText()
                const relativePath = formatPath(cwd, this.params.path)

                let prev = defaultStylizedFile()
                if (await ctx.fs.exists(this.params.path)) {
                    const file = (await ctx.fs.readFile(this.params.path)).toString('utf-8')
                    prev = stylizeOutputIfAble(ctx, this.params.path, file)
                }

                const newFile = stylizeOutputIfAble(ctx, relativePath, fileText)
                await printDiff(updates, prev, newFile, 1)
                break
            }

            case 'insert': {
                const relativePath = formatPath(cwd, this.params.path)
                const file = (await ctx.fs.readFile(relativePath)).toString('utf-8')

                // Diff the old with the new by adding extra context around the line being inserted
                const { prefix, startLine, suffix } = getLinesWithContext(
                    file,
                    this.params.insert_line,
                    this.params.insert_line,
                    3
                )

                const lines = file.split('\n')
                const insertLineContent =
                    this.params.insert_line > 0 && this.params.insert_line <= lines.length
                        ? lines[this.params.insert_line - 1] + '\n'
                        : ''

                const old = prefix + insertLineContent + suffix
                const newContent = prefix + insertLineContent + this.params.new_str + suffix

                const oldStyled = stylizeOutputIfAble(ctx, relativePath, old)
                const newStyled = stylizeOutputIfAble(ctx, relativePath, newContent)

                await printDiff(updates, oldStyled, newStyled, startLine)
                break
            }

            case 'str_replace': {
                const relativePath = formatPath(cwd, this.params.path)
                const file = (await readFile(relativePath)).toString('utf-8')
                const lineInfo = lineNumberAt(file, this.params.old_str)
                const startLine = lineInfo ? lineInfo.startLine : 0

                const oldStr = stylizeOutputIfAble(ctx, relativePath, this.params.old_str)
                const newStr = stylizeOutputIfAble(ctx, relativePath, this.params.new_str)

                await printDiff(updates, oldStr, newStr, startLine)
                break
            }

            case 'append': {
                const relativePath = formatPath(cwd, this.params.path)
                const fileContent = (await ctx.fs.readFile(relativePath)).toString('utf-8')
                const startLine = fileContent.split('\n').length + 1

                const newContent = stylizeOutputIfAble(ctx, relativePath, this.params.new_str)
                await printDiff(updates, defaultStylizedFile(), newContent, startLine)
                break
            }
        }
    }

    /**
     * Validate the file write operation parameters
     * @param ctx Context for file operations
     */
    public async validate(ctx: Context): Promise<void> {
        switch (this.params.command) {
            case 'create':
                if (!this.params.path) {
                    throw new Error('Path must not be empty')
                }
                break

            case 'str_replace':
            case 'insert':
                const path = sanitizePathToolArg(ctx, this.params.path)
                if (!(await ctx.fs.exists(path))) {
                    throw new Error('The provided path must exist in order to replace or insert contents into it')
                }
                break

            case 'append':
                if (!this.params.path) {
                    throw new Error('Path must not be empty')
                }
                if (!this.params.new_str) {
                    throw new Error('Content to append must not be empty')
                }
                break
        }
    }

    /**
     * Print the relative path of the file being modified
     * @param ctx Context for file operations
     * @param updates Writable stream to write updates to
     */
    private async printRelativePath(ctx: Context, updates: Writable): Promise<void> {
        const cwd = ctx.env.currentDir()
        const filePath = this.params.path
        const relativePath = formatPath(cwd, filePath)

        updates.write(`Path: ${chalk.green(relativePath)}\n\n`)
    }

    /**
     * Get the text to use for the create command
     * @returns The text to write to the file
     */
    private getCanonicalCreateCommandText(): string {
        if (this.params.command === 'create') {
            if (this.params.file_text) {
                return this.params.file_text
            } else if (this.params.new_str) {
                console.warn('Required field `file_text` is missing, using the provided `new_str` instead')
                return this.params.new_str
            } else {
                console.warn('No content provided for the create command')
                return ''
            }
        }
        return ''
    }
}

/**
 * Writes content to a file, adding a newline if necessary
 * @param ctx Context for file operations
 * @param filePath Path to the file
 * @param content Content to write
 */
async function writeToFile(ctx: Context, filePath: string, content: string): Promise<void> {
    if (!content.endsWith('\n')) {
        content += '\n'
    }
    await writeFile(filePath, content)
}

/**
 * Returns a prefix/suffix pair before and after the content dictated by [startLine, endLine]
 * @param content File content
 * @param startLine 1-indexed starting line
 * @param endLine 1-indexed ending line
 * @param contextLines Number of lines to include before and after
 */
function getLinesWithContext(
    content: string,
    startLine: number,
    endLine: number,
    contextLines: number
): { prefix: string; startLine: number; suffix: string; endLine: number } {
    const lines = content.split('\n')
    const lineCount = lines.length

    // Handle zero-based indexing
    const zeroCheckInc = endLine === 0 ? 0 : 1

    // Convert to 0-indexing and clamp to valid range
    const start = Math.max(0, Math.min(startLine - 1, lineCount - 1))
    const end = Math.max(0, Math.min(endLine - 1, lineCount - 1))

    const newStartLine = Math.max(0, start - contextLines)
    const newEndLine = Math.min(lineCount - 1, end + contextLines)

    // Build prefix
    const prefixLines = lines.slice(newStartLine, start)
    const prefix = prefixLines.join('\n') + (prefixLines.length > 0 ? '\n' : '')

    // Build suffix
    const suffixLines = lines.slice(end + zeroCheckInc, newEndLine + 1)
    const suffix = (suffixLines.length > 0 ? '\n' : '') + suffixLines.join('\n')

    return {
        prefix,
        startLine: newStartLine + 1,
        suffix,
        endLine: newEndLine + zeroCheckInc,
    }
}

/**
 * Prints a git-diff style comparison between oldStr and newStr
 * @param updates Writable stream to write updates to
 * @param oldStr Old file content
 * @param newStr New file content
 * @param startLine 1-indexed line number that oldStr and newStr start at
 */
async function printDiff(
    updates: Writable,
    oldStr: StylizedFile,
    newStr: StylizedFile,
    startLine: number
): Promise<void> {
    const diff = diffLines(oldStr.content, newStr.content)

    // Calculate gutter width for line numbers
    let maxOldI = 0
    let maxNewI = 0
    let oldLineCounter = startLine
    let newLineCounter = startLine

    for (const part of diff) {
        const lineCount = part.value.split('\n').length - 1
        if (!part.added && !part.removed) {
            oldLineCounter += lineCount
            newLineCounter += lineCount
            maxOldI = Math.max(maxOldI, oldLineCounter)
            maxNewI = Math.max(maxNewI, newLineCounter)
        } else if (part.added) {
            newLineCounter += lineCount
            maxNewI = Math.max(maxNewI, newLineCounter)
        } else if (part.removed) {
            oldLineCounter += lineCount
            maxOldI = Math.max(maxOldI, oldLineCounter)
        }
    }

    const oldLineNumWidth = terminalWidthRequiredForLineCount(maxOldI)
    const newLineNumWidth = terminalWidthRequiredForLineCount(maxNewI)

    // Reset counters for actual printing
    oldLineCounter = startLine
    newLineCounter = startLine

    // Print the diff
    for (const part of diff) {
        const lines = part.value.split('\n')
        // Remove the last empty line that comes from splitting
        if (lines[lines.length - 1] === '') {
            lines.pop()
        }

        for (const line of lines) {
            let sign = ' '
            let textColor = ''
            let gutterBg = newStr.gutterBg
            let lineBg = newStr.lineBg

            if (part.added) {
                sign = '+'
                textColor = newStr.truecolor ? '' : chalk.green.toString()
                gutterBg = newStr.truecolor ? '\x1b[48;2;40;67;43m' : ''
                lineBg = newStr.truecolor ? '\x1b[48;2;24;38;30m' : ''
            } else if (part.removed) {
                sign = '-'
                textColor = newStr.truecolor ? '' : chalk.red.toString()
                gutterBg = newStr.truecolor ? '\x1b[48;2;79;40;40m' : ''
                lineBg = newStr.truecolor ? '\x1b[48;2;36;25;28m' : ''
            }

            const oldIStr = !part.added ? String(oldLineCounter++) : ' '
            const newIStr = !part.removed ? String(newLineCounter++) : ' '

            // Print the gutter and line numbers
            updates.write(`${gutterBg}${textColor}${sign} ${oldIStr.padStart(oldLineNumWidth)}`)
            updates.write(sign === ' ' ? ', ' : '  ')
            updates.write(`${newIStr.padStart(newLineNumWidth)}:`)

            // Print the line
            updates.write(`${lineBg} ${line}\x1b[0m\n`)
        }
    }
}

/**
 * Returns a 1-indexed line number range of the start and end of needle inside file
 * @param file File content
 * @param needle Text to find
 */
function lineNumberAt(file: string, needle: string): { startLine: number; endLine: number } | null {
    const index = file.indexOf(needle)
    if (index === -1) {
        return null
    }

    const startLine = file.substring(0, index).split('\n').length
    const endLine = startLine + needle.split('\n').length - 1

    return { startLine, endLine }
}

/**
 * Returns the number of terminal cells required for displaying line numbers
 * @param lineCount Number of lines
 */
function terminalWidthRequiredForLineCount(lineCount: number): number {
    return lineCount.toString().length
}

/**
 * Find all occurrences of a substring in a string
 * @param str String to search in
 * @param searchStr Substring to find
 */
function findAllOccurrences(str: string, searchStr: string): number[] {
    const indices: number[] = []
    let currentIndex = 0

    while (currentIndex < str.length) {
        const index = str.indexOf(searchStr, currentIndex)
        if (index === -1) {
            break
        }

        indices.push(index)
        currentIndex = index + 1
    }

    return indices
}

/**
 * Stylize output with syntax highlighting if possible
 * @param ctx Context for environment information
 * @param filePath Path to the file
 * @param fileText File content
 */
function stylizeOutputIfAble(ctx: Context, filePath: string, fileText: string): StylizedFile {
    if (supportsColorOutput(ctx)) {
        try {
            return stylizedFile(filePath, fileText)
        } catch (err) {
            console.error('Unable to syntax highlight the output:', err)
        }
    }

    return {
        truecolor: false,
        content: fileText,
        gutterBg: '',
        lineBg: '',
    }
}

/**
 * Returns a syntax-highlighted version of the file
 * @param filePath Path to the file
 * @param fileText File content
 */
function stylizedFile(filePath: string, fileText: string): StylizedFile {
    const extension = path.extname(filePath).substring(1)
    let language: string

    // Map file extension to Prism language
    switch (extension) {
        case 'js':
            language = 'javascript'
            break
        case 'ts':
            language = 'typescript'
            break
        case 'py':
            language = 'python'
            break
        case 'sh':
        case 'bash':
            language = 'bash'
            break
        case 'json':
            language = 'json'
            break
        case 'md':
            language = 'markdown'
            break
        default:
            language = 'markup' // Default language
    }

    // Use Prism for syntax highlighting
    const highlighted = prism.highlight(fileText, prism.languages[language], language)

    // Convert to terminal-friendly format
    const lines = highlighted.split('\n')
    const styledLines = lines.map((line) => {
        // Convert HTML-style syntax highlighting to terminal colors
        // This is a simplified version - a real implementation would need more conversion logic
        return line
            .replace(/<span class="token comment">([^<]+)<\/span>/g, '\x1b[38;2;128;128;128m$1\x1b[0m')
            .replace(/<span class="token keyword">([^<]+)<\/span>/g, '\x1b[38;2;86;156;214m$1\x1b[0m')
            .replace(/<span class="token string">([^<]+)<\/span>/g, '\x1b[38;2;206;145;120m$1\x1b[0m')
            .replace(/<span class="token function">([^<]+)<\/span>/g, '\x1b[38;2;220;220;170m$1\x1b[0m')
            .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
    })

    return {
        truecolor: true,
        content: styledLines.join('\n'),
        gutterBg: '\x1b[48;2;30;30;30m', // Dark gray background for gutter
        lineBg: '\x1b[48;2;40;40;40m', // Slightly lighter gray for code
    }
}

/**
 * Check if the terminal supports true color
 * @param ctx Context for environment information
 */
function supportsColorOutput(ctx: Context): boolean {
    return true
}

/**
 * Performs tilde expansion and other required sanitization for path arguments
 * @param ctx Context for environment information
 * @param pathArg Path argument
 */
function sanitizePathToolArg(ctx: Context, pathArg: string): string {
    const fs = ctx.fs
    console.log('context evn', ctx.env.home(), ctx.env.currentDir())
    const pathParts = pathArg.split(path.sep)

    // Expand ~ if it's the first part
    if (pathParts[0] === '~') {
        pathParts[0] = ctx.env.home()
    }

    let result = path.join(...pathParts)
    if (pathArg.startsWith('/')) {
        result = '/' + result
    }
    return fs.chrootPath(result)
}

/**
 * Converts an absolute path to a relative path according to the current working directory
 * @param cwd Current working directory
 * @param pathArg Path to convert
 */
function absoluteToRelative(cwd: string, pathArg: string): string {
    try {
        const absoluteCwd = path.resolve(cwd)
        const absolutePath = path.resolve(pathArg)

        // If they're on different drives (Windows), return the absolute path
        if (path.parse(absoluteCwd).root !== path.parse(absolutePath).root) {
            return absolutePath
        }

        const relativePath = path.relative(absoluteCwd, absolutePath)

        // If the path goes up more than two levels, just use the absolute path
        if (
            relativePath.startsWith('..') &&
            relativePath.split(path.sep)[0] === '..' &&
            relativePath.split(path.sep)[1] === '..' &&
            relativePath.split(path.sep)[2] === '..'
        ) {
            return absolutePath
        }

        return relativePath || '.'
    } catch (error) {
        return pathArg
    }
}

/**
 * Format a path as relative to the current working directory if possible
 * @param cwd Current working directory
 * @param pathArg Path to format
 */
function formatPath(cwd: string, pathArg: string): string {
    try {
        return absoluteToRelative(cwd, pathArg)
    } catch (error) {
        return pathArg
    }
}

// Default implementation of the Context for testing
export class DefaultContext implements Context {
    fs: DefaultFileSystem
    env: EnvironmentProvider

    constructor() {
        this.fs = new DefaultFileSystem()
        this.env = new DefaultEnvironmentProvider()
    }
}

/**
 * File system interface for operations
 */
export interface FileSystem {
    readFile(path: string): Promise<Buffer>
    readFileSync(path: string): Buffer
    writeFile(path: string, data: string | Buffer): Promise<void>
    mkdir(path: string, options?: { recursive: boolean }): Promise<void>
    exists(path: string): Promise<boolean>
    existsSync(path: string): boolean
    chrootPath(path: string | string[]): string
}

// Default implementation of FileSystem
class DefaultFileSystem implements FileSystem {
    async readFile(path: string): Promise<Buffer> {
        return await readFile(path)
    }

    readFileSync(path: string): Buffer {
        return fs.readFileSync(path)
    }

    async writeFile(path: string, data: string | Buffer): Promise<void> {
        return await writeFile(path, data)
    }

    async mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
        return await mkdir(path)
    }

    async exists(path: string): Promise<boolean> {
        try {
            await access(path, fs.constants.F_OK)
            return true
        } catch {
            return false
        }
    }

    existsSync(path: string): boolean {
        return fs.existsSync(path)
    }

    chrootPath(path: string | string[]): string {
        if (Array.isArray(path)) {
            return path.join('/')
        }
        return path
    }
}

// Default implementation of EnvironmentProvider
class DefaultEnvironmentProvider implements EnvironmentProvider {
    currentDir(): string {
        return process.cwd()
    }

    home(): string {
        return os.homedir()
    }

    get(name: string): string | undefined {
        return process.env[name]
    }
}

// // Example usage and tests
// async function runTests(): Promise<void> {
//     const ctx = new DefaultContext();
//     const testDir = "/Users/gril/Desktop/tst/gril";
//
//     try {
//         // Setup test directory
//         console.log("Testing start.......")
//         // await mkdir(testDir);
//         const testFilePath = path.join(testDir, 'test-file.txt');
//         await writeFile(testFilePath, '1: Hello world!\n2: This is line 2\n3: asdf\n4: Hello world!\n');
//
//         console.log('Testing create command...');
//         const createTool = new FsWrite({
//             command: 'create',
//             path: path.join(testDir, 'new-file-3.txt'),
//             file_text: 'Hello, world!'
//         });
//
//         await createTool.invoke(ctx, process.stdout);
//
//         console.log('Testing str_replace command...');
//         const replaceTool = new FsWrite({
//             command: 'str_replace',
//             path: testFilePath,
//             old_str: '1: Hello world!',
//             new_str: '1: Goodbye world!'
//         });
//
//         await replaceTool.invoke(ctx, process.stdout);
//
//         console.log('Testing insert command...');
//         const insertTool = new FsWrite({
//             command: 'insert',
//             path: testFilePath,
//             insert_line: 1,
//             new_str: '0: Inserted line\n'
//         });
//
//         await insertTool.invoke(ctx, process.stdout);
//
//         console.log('Testing append command...');
//         const appendTool = new FsWrite({
//             command: 'append',
//             path: testFilePath,
//             new_str: '5: Appended line'
//         });
//
//         await appendTool.invoke(ctx, process.stdout);
//
//         console.log('All tests completed successfully!');
//     } catch (error) {
//         console.error('Test failed:', error);
//     } finally {
//         // Clean up test directory
//         // try {
//         //     fs.rmSync(testDir, { recursive: true, force: true });
//         // } catch (error) {
//         //     console.error('Failed to clean up test directory:', error);
//         // }
//     }
// }
//
// // Run tests if this file is executed directly
// if (require.main === module) {
//     runTests().catch(console.error);
// }

export default FsWrite
