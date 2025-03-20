/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
// eslint-disable-next-line no-restricted-imports
import { Stats } from 'fs'

// Constants
// eslint-disable-next-line @typescript-eslint/naming-convention
const MAX_TOOL_RESPONSE_SIZE = 30720 // 30KB

// Types
interface Context {
    fs?: typeof fs
    env: {
        currentDir(): string
    }
}

enum OutputKind {
    Text = 'text',
    Json = 'json',
}

export interface InvokeOutput {
    output: {
        kind: OutputKind
        content: string
    }
}

export interface FsReadParams {
    path: string
    readRange?: number[]
}

export class FsRead {
    path: string
    readRange?: number[]
    private type?: boolean // true for file, false for directory

    constructor(params: FsReadParams) {
        this.path = params.path
        this.readRange = params.readRange
    }

    private getReadRange(): [number, number | undefined] | undefined {
        if (!this.readRange) {
            return undefined
        }

        if (this.readRange.length === 1) {
            return [this.readRange[0], undefined]
        } else if (this.readRange.length >= 2) {
            return [this.readRange[0], this.readRange[1]]
        }

        throw new Error(`Invalid read range: ${JSON.stringify(this.readRange)}`)
    }

    private sanitizePath(ctx: Context, inputPath: string): string {
        // Implement path sanitization logic here
        // This would handle relative paths, home directory expansion, etc.
        if (inputPath.startsWith('~')) {
            return path.join(os.homedir(), inputPath.substring(1))
        }
        return path.resolve(inputPath)
    }

    private formatPath(cwd: string, filePath: string): string {
        // Format path relative to cwd if possible
        try {
            return path.relative(cwd, filePath) || filePath
        } catch {
            return filePath
        }
    }

    async invoke(ctx: Context): Promise<InvokeOutput> {
        const resolvedPath = this.sanitizePath(ctx, this.path)
        const stats = await fs.stat(resolvedPath)
        const isFile = stats.isFile()
        const cwd = ctx.env.currentDir()
        const relativePath = this.formatPath(cwd, resolvedPath)

        // eslint-disable-next-line aws-toolkits/no-console-log
        console.log(`Reading: ${relativePath}`)

        if (isFile) {
            const readRange = this.getReadRange()

            if (readRange && readRange[1] !== undefined) {
                // Read specific line range
                const [start, end] = readRange
                const fileContent = await fs.readFile(resolvedPath, 'utf-8')
                const lines = fileContent.split('\n')
                const lineCount = lines.length

                // Convert negative 1-based indices to positive 0-based indices
                const convertIndex = (i: number): number => {
                    if (i <= 0) {
                        return (lineCount + i) as number
                    } else {
                        return i - 1
                    }
                }

                const startIdx = convertIndex(start)
                const endIdx = convertIndex(end)

                // Quick check for invalid model input
                if (startIdx > endIdx) {
                    return {
                        output: {
                            kind: OutputKind.Text,
                            content: '',
                        },
                    }
                }

                // The range should be inclusive on both ends
                const fileContents = lines.slice(startIdx, endIdx + 1).join('\n')

                // eslint-disable-next-line aws-toolkits/no-console-log
                console.log(`Reading: ${relativePath}, lines ${startIdx + 1}-${endIdx + 1}`)

                const byteCount = Buffer.byteLength(fileContents)
                if (byteCount > MAX_TOOL_RESPONSE_SIZE) {
                    throw new Error(
                        `This tool only supports reading ${MAX_TOOL_RESPONSE_SIZE} bytes at a time. You tried to read ${byteCount} bytes. Try executing with fewer lines specified.`
                    )
                }

                return {
                    output: {
                        kind: OutputKind.Text,
                        content: fileContents,
                    },
                }
            }

            // Read entire file
            const fileContent = await fs.readFile(resolvedPath, 'utf-8')
            const byteCount = Buffer.byteLength(fileContent)

            if (byteCount > MAX_TOOL_RESPONSE_SIZE) {
                throw new Error(
                    `This tool only supports reading up to ${MAX_TOOL_RESPONSE_SIZE} bytes at a time. You tried to read ${byteCount} bytes. Try executing with fewer lines specified.`
                )
            }

            return {
                output: {
                    kind: OutputKind.Text,
                    content: fileContent,
                },
            }
        } else {
            // Handle directory reading
            const maxDepth = this.getReadRange()?.[0] || 0
            // eslint-disable-next-line aws-toolkits/no-console-log
            console.log(`Reading to max depth: ${maxDepth}`)

            const result: string[] = []
            const dirQueue: [string, number][] = [[resolvedPath, 0]]

            while (dirQueue.length > 0) {
                const [currentPath, depth] = dirQueue.shift()!

                if (depth > maxDepth) {
                    break
                }

                const relativePath = this.formatPath(cwd, currentPath)
                // eslint-disable-next-line aws-toolkits/no-console-log
                console.log(`Reading: ${relativePath}`)

                const entries = await fs.readdir(currentPath, { withFileTypes: true })

                for (const entry of entries) {
                    const entryPath = path.join(currentPath, entry.name)
                    const stats = await fs.stat(entryPath)

                    // Format mode similar to ls -l
                    const formattedMode = this.formatMode(stats.mode)

                    // Format date
                    const modifiedTime = stats.mtime
                    const formattedDate = modifiedTime.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                    })

                    // Format entry similar to ls -l
                    result.push(
                        `${this.formatFileType(stats)}${formattedMode} ${stats.nlink} ${stats.uid} ${stats.gid} ${stats.size} ${formattedDate} ${entryPath}`
                    )

                    if (entry.isDirectory()) {
                        dirQueue.push([entryPath, depth + 1])
                    }
                }
            }

            const resultText = result.join('\n')
            const byteCount = Buffer.byteLength(resultText)

            if (byteCount > MAX_TOOL_RESPONSE_SIZE) {
                throw new Error(
                    `This tool only supports reading up to ${MAX_TOOL_RESPONSE_SIZE} bytes at a time. You tried to read ${byteCount} bytes. Try executing with fewer lines specified.`
                )
            }

            return {
                output: {
                    kind: OutputKind.Text,
                    content: resultText,
                },
            }
        }
    }

    async validate(ctx: Context): Promise<void> {
        const resolvedPath = this.sanitizePath(ctx, this.path)

        try {
            const stats = await fs.stat(resolvedPath)
            this.type = stats.isFile()
        } catch (error) {
            throw new Error(`'${this.path}' does not exist`)
        }
    }

    describeOperation(): string {
        if (this.type === undefined) {
            throw new Error('Tool needs to have been validated')
        }

        if (this.type) {
            // File operation
            let description = `Reading file: ${this.path}, `

            const readRange = this.readRange
            const start = readRange?.[0]
            const end = readRange?.[1]

            if (start !== undefined && end !== undefined) {
                description += `from line ${start} to ${end}`
            } else if (start !== undefined) {
                if (start > 0) {
                    description += `from line ${start} to end of file`
                } else {
                    description += `${start} line from the end of file to end of file`
                }
            } else {
                description += 'all lines'
            }

            return description
        } else {
            // Directory operation
            const depth = this.readRange?.[0] || 0
            return `Reading directory: ${this.path} with maximum depth of ${depth}`
        }
    }

    private formatFileType(stats: Stats): string {
        if (stats.isSymbolicLink()) {
            return 'l'
        }
        if (stats.isFile()) {
            return '-'
        }
        if (stats.isDirectory()) {
            return 'd'
        }
        return '-'
    }

    private formatMode(mode: number): string {
        // Extract the permission bits (last 9 bits)
        mode = mode & 0o777
        const result = '-'.repeat(9).split('')

        // Helper function to convert octal permission to rwx format
        const octalToChars = (val: number): string[] => {
            switch (val) {
                case 1:
                    return ['-', '-', 'x']
                case 2:
                    return ['-', 'w', '-']
                case 3:
                    return ['-', 'w', 'x']
                case 4:
                    return ['r', '-', '-']
                case 5:
                    return ['r', '-', 'x']
                case 6:
                    return ['r', 'w', '-']
                case 7:
                    return ['r', 'w', 'x']
                default:
                    return ['-', '-', '-']
            }
        }

        // Process permissions for owner, group, others
        for (let i = 0; i < 3; i++) {
            const val = (mode >> (i * 3)) & 0o7
            const chars = octalToChars(val)
            result[6 - i * 3] = chars[0]
            result[7 - i * 3] = chars[1]
            result[8 - i * 3] = chars[2]
        }

        return result.join('')
    }
}

// Example usage:
// const fsRead = new FsRead({ path: '/path/to/file', readRange: [1, 10] });
// await fsRead.validate(context);
// const result = await fsRead.invoke(context);
