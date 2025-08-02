/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { DiagnosticCollection } from './diagnosticsMonitor'
import { mapDiagnosticSeverity } from '../shared/diagnosticUtils'

export interface Problem {
    readonly uri: vscode.Uri
    readonly diagnostic: vscode.Diagnostic
    readonly severity: 'error' | 'warning' | 'info' | 'hint'
    readonly source: string
    readonly isNew: boolean
}

export interface CategorizedProblems {
    readonly errors: Problem[]
    readonly warnings: Problem[]
    readonly info: Problem[]
    readonly hints: Problem[]
}

/**
 * Detects new problems by comparing diagnostic snapshots and filtering relevant issues.
 */
export class ProblemDetector {
    /**
     * Filters problems to only include those relevant to changed files
     */
    public filterRelevantProblems(problems: Problem[], changedFiles: string[]): Problem[] {
        if (changedFiles.length === 0) {
            return problems
        }

        const changedFileSet = new Set(changedFiles.map((file) => path.normalize(file)))

        const relevantProblems = problems.filter((problem) => {
            const problemFile = path.normalize(problem.uri.fsPath)
            return changedFileSet.has(problemFile) || this.isRelatedFile(problemFile, changedFiles)
        })
        return relevantProblems
    }

    /**
     * Categorizes problems by severity level
     */
    public categorizeBySeverity(problems: Problem[]): CategorizedProblems {
        const categorized: CategorizedProblems = {
            errors: [],
            warnings: [],
            info: [],
            hints: [],
        }

        for (const problem of problems) {
            switch (problem.severity) {
                case 'error':
                    categorized.errors.push(problem)
                    break
                case 'warning':
                    categorized.warnings.push(problem)
                    break
                case 'info':
                    categorized.info.push(problem)
                    break
                case 'hint':
                    categorized.hints.push(problem)
                    break
            }
        }
        return categorized
    }

    /**
     * Gets all problems from a diagnostic collection
     */
    public getAllProblems(diagnostics: DiagnosticCollection): Problem[] {
        const problems: Problem[] = []

        for (const [uri, fileDiagnostics] of diagnostics.diagnostics) {
            for (const diagnostic of fileDiagnostics) {
                problems.push(this.createProblem(uri, diagnostic, false))
            }
        }
        return problems
    }

    /**
     * Filters problems by source (TypeScript, ESLint, etc.)
     */
    public filterBySource(problems: Problem[], sources: string[]): Problem[] {
        const filtered = problems.filter((problem) => sources.length === 0 || sources.includes(problem.source))
        return filtered
    }

    /**
     * Gets only critical problems (errors)
     */
    public getCriticalProblems(problems: Problem[]): Problem[] {
        return problems.filter((problem) => problem.severity === 'error')
    }

    private createProblem(uri: vscode.Uri, diagnostic: vscode.Diagnostic, isNew: boolean): Problem {
        return {
            uri,
            diagnostic,
            severity: mapDiagnosticSeverity(diagnostic.severity),
            source: diagnostic.source || 'unknown',
            isNew,
        }
    }

    private isRelatedFile(problemFile: string, changedFiles: string[]): boolean {
        // Check if the problem file is in the same directory or a parent/child directory
        // of any changed file (simple heuristic for related files)
        for (const changedFile of changedFiles) {
            const normalizedChanged = path.normalize(changedFile)
            const problemDir = path.dirname(problemFile)
            const changedDir = path.dirname(normalizedChanged)

            // Same directory
            if (problemDir === changedDir) {
                return true
            }

            // Parent/child relationship
            if (problemDir.startsWith(changedDir) || changedDir.startsWith(problemDir)) {
                return true
            }
        }

        return false
    }
}
