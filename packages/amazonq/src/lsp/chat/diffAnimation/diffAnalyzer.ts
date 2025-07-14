/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from 'aws-core-vscode/shared'
import { diffLines } from 'diff'
import { DiffLine, ChangedRegion, ScanPlan } from './types'

export class DiffAnalyzer {
    constructor() {
        getLogger().info('[DiffAnalyzer] 🚀 Initialized diff analyzer')
    }

    /**
     * Calculate the changed region between original and new content
     */
    public calculateChangedRegion(originalContent: string, newContent: string): ChangedRegion {
        // For new files, animate all lines
        if (!originalContent || originalContent === '') {
            const lines = newContent.split('\n')
            return {
                startLine: 0,
                endLine: Math.min(lines.length - 1, 99), // Cap at 100 lines
                totalLines: lines.length,
            }
        }

        const changes = diffLines(originalContent, newContent)
        let minChangedLine = Infinity
        let maxChangedLine = -1
        let currentLine = 0
        const newLines = newContent.split('\n')

        for (const change of changes) {
            const changeLines = change.value.split('\n')
            // Remove empty last element from split
            if (changeLines[changeLines.length - 1] === '') {
                changeLines.pop()
            }

            if (change.added || change.removed) {
                minChangedLine = Math.min(minChangedLine, currentLine)
                maxChangedLine = Math.max(maxChangedLine, currentLine + changeLines.length - 1)
            }

            if (!change.removed) {
                currentLine += changeLines.length
            }
        }

        // If no changes found, animate the whole file
        if (minChangedLine === Infinity) {
            return {
                startLine: 0,
                endLine: Math.min(newLines.length - 1, 99),
                totalLines: newLines.length,
            }
        }

        // Add context lines (3 before and after)
        const contextLines = 3
        const startLine = Math.max(0, minChangedLine - contextLines)
        const endLine = Math.min(newLines.length - 1, maxChangedLine + contextLines)

        // Cap at 100 lines for performance
        const animationLines = endLine - startLine + 1
        if (animationLines > 100) {
            getLogger().info(`[DiffAnalyzer] Capping animation from ${animationLines} to 100 lines`)
            return {
                startLine,
                endLine: startLine + 99,
                totalLines: newLines.length,
            }
        }

        return {
            startLine,
            endLine,
            totalLines: newLines.length,
        }
    }

    /**
     * Create a smart scan plan based on changed regions
     */
    public createScanPlan(originalContent: string, newContent: string, changedRegion: ChangedRegion): ScanPlan {
        const changes = diffLines(originalContent, newContent)
        const leftLines: Array<DiffLine & { index: number }> = []
        const rightLines: Array<DiffLine & { index: number }> = []
        const scanPlan: Array<{
            leftIndex: number | undefined
            rightIndex: number | undefined
            leftLine?: DiffLine & { index: number }
            rightLine?: DiffLine & { index: number }
            preAdded?: boolean
        }> = []

        let leftLineNum = 1
        let rightLineNum = 1
        let leftIndex = 0
        let rightIndex = 0

        for (const change of changes) {
            const lines = change.value.split('\n').filter((l) => l !== undefined)
            if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
                continue
            }

            if (change.removed) {
                // Removed lines only on left
                for (const line of lines) {
                    const diffLine = {
                        type: 'removed' as const,
                        content: line,
                        lineNumber: leftLineNum,
                        oldLineNumber: leftLineNum++,
                        index: leftIndex,
                        leftLineNumber: leftLineNum - 1,
                    }
                    leftLines.push(diffLine)

                    // Add to scan plan if in changed region
                    if (leftIndex >= changedRegion.startLine && leftIndex <= changedRegion.endLine) {
                        scanPlan.push({
                            leftIndex: leftIndex,
                            rightIndex: undefined,
                            leftLine: diffLine,
                        })
                    }
                    leftIndex++
                }
            } else if (change.added) {
                // Added lines only on right
                for (const line of lines) {
                    const diffLine = {
                        type: 'added' as const,
                        content: line,
                        lineNumber: rightLineNum,
                        newLineNumber: rightLineNum++,
                        index: rightIndex,
                        rightLineNumber: rightLineNum - 1,
                    }
                    rightLines.push(diffLine)

                    // Add to scan plan if in changed region
                    if (rightIndex >= changedRegion.startLine && rightIndex <= changedRegion.endLine) {
                        scanPlan.push({
                            leftIndex: undefined,
                            rightIndex: rightIndex,
                            rightLine: diffLine,
                        })
                    }
                    rightIndex++
                }
            } else {
                // Unchanged lines on both sides
                for (const line of lines) {
                    const leftDiffLine = {
                        type: 'unchanged' as const,
                        content: line,
                        lineNumber: leftLineNum,
                        oldLineNumber: leftLineNum++,
                        index: leftIndex,
                        leftLineNumber: leftLineNum - 1,
                    }

                    const rightDiffLine = {
                        type: 'unchanged' as const,
                        content: line,
                        lineNumber: rightLineNum,
                        newLineNumber: rightLineNum++,
                        index: rightIndex,
                        rightLineNumber: rightLineNum - 1,
                    }

                    leftLines.push(leftDiffLine)
                    rightLines.push(rightDiffLine)

                    // Add to scan plan if in changed region
                    if (leftIndex >= changedRegion.startLine && leftIndex <= changedRegion.endLine) {
                        scanPlan.push({
                            leftIndex: leftIndex,
                            rightIndex: rightIndex,
                            leftLine: leftDiffLine,
                            rightLine: rightDiffLine,
                        })
                    }

                    leftIndex++
                    rightIndex++
                }
            }
        }

        return { leftLines, rightLines, scanPlan }
    }

    /**
     * Parse diff lines for display
     */
    public parseDiffLines(
        originalContent: string,
        newContent: string
    ): {
        leftLines: DiffLine[]
        rightLines: DiffLine[]
    } {
        const changes = diffLines(originalContent, newContent)
        const leftLines: DiffLine[] = []
        const rightLines: DiffLine[] = []

        let leftLineNum = 1
        let rightLineNum = 1

        for (const change of changes) {
            const lines = change.value.split('\n').filter((l, i, arr) => {
                // Keep all lines except the last empty one from split
                return i < arr.length - 1 || l !== ''
            })

            if (change.removed) {
                // Removed lines only appear on left
                for (const line of lines) {
                    leftLines.push({
                        type: 'removed',
                        content: line,
                        lineNumber: leftLineNum++,
                        oldLineNumber: leftLineNum - 1,
                    })
                }
            } else if (change.added) {
                // Added lines only appear on right
                for (const line of lines) {
                    rightLines.push({
                        type: 'added',
                        content: line,
                        lineNumber: rightLineNum++,
                        newLineNumber: rightLineNum - 1,
                    })
                }
            } else {
                // Unchanged lines appear on both sides
                for (const line of lines) {
                    leftLines.push({
                        type: 'unchanged',
                        content: line,
                        lineNumber: leftLineNum++,
                        oldLineNumber: leftLineNum - 1,
                    })

                    rightLines.push({
                        type: 'unchanged',
                        content: line,
                        lineNumber: rightLineNum++,
                        newLineNumber: rightLineNum - 1,
                    })
                }
            }
        }

        return { leftLines, rightLines }
    }

    /**
     * Calculate animation timing based on content size
     */
    public calculateAnimationTiming(scanPlanLength: number): {
        scanDelay: number
        totalDuration: number
    } {
        const scanDelay = scanPlanLength > 50 ? 40 : 70
        const totalDuration = scanPlanLength * scanDelay

        return { scanDelay, totalDuration }
    }

    /**
     * Analyze diff complexity for optimization decisions
     */
    public analyzeDiffComplexity(
        originalContent: string,
        newContent: string
    ): {
        isSimple: boolean
        lineCount: number
        changeRatio: number
        recommendation: 'full' | 'partial' | 'static'
    } {
        const originalLines = originalContent.split('\n').length
        const newLines = newContent.split('\n').length
        const maxLines = Math.max(originalLines, newLines)

        const changes = diffLines(originalContent, newContent)
        let changedLines = 0

        for (const change of changes) {
            if (change.added || change.removed) {
                changedLines += change.value.split('\n').length - 1
            }
        }

        const changeRatio = maxLines > 0 ? changedLines / maxLines : 0
        const isSimple = maxLines < 50 && changeRatio < 0.5

        let recommendation: 'full' | 'partial' | 'static' = 'full'
        if (maxLines > 200) {
            recommendation = 'static'
        } else if (changeRatio < 0.3 && maxLines > 20) {
            recommendation = 'partial'
        }

        return {
            isSimple,
            lineCount: maxLines,
            changeRatio,
            recommendation,
        }
    }
}
