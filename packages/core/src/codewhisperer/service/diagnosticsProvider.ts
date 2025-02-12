/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CodeScanIssue, AggregatedCodeScanIssue } from '../models/model'
import { CodeAnalysisScope, codewhispererDiagnosticSourceLabel } from '../models/constants'
import { SecurityIssueTreeViewProvider } from './securityIssueTreeViewProvider'
import { SecurityIssueProvider } from './securityIssueProvider'

export interface SecurityDiagnostic extends vscode.Diagnostic {
    findingId?: string
}

interface SecurityScanRender {
    securityDiagnosticCollection: vscode.DiagnosticCollection | undefined
    initialized: boolean
}

export const securityScanRender: SecurityScanRender = {
    securityDiagnosticCollection: undefined,
    initialized: false,
}

export function initSecurityScanRender(
    securityRecommendationList: AggregatedCodeScanIssue[],
    context: vscode.ExtensionContext,
    editor: vscode.TextEditor | undefined,
    scope: CodeAnalysisScope
) {
    securityScanRender.initialized = false
    if (scope === CodeAnalysisScope.FILE_ON_DEMAND && editor) {
        securityScanRender.securityDiagnosticCollection?.delete(editor.document.uri)
    } else if (scope === CodeAnalysisScope.PROJECT) {
        securityScanRender.securityDiagnosticCollection?.clear()
    }
    for (const securityRecommendation of securityRecommendationList) {
        updateSecurityDiagnosticCollection(securityRecommendation)
        updateSecurityIssuesForProviders(securityRecommendation, scope === CodeAnalysisScope.FILE_AUTO)
    }
    securityScanRender.initialized = true
}

function updateSecurityIssuesForProviders(securityRecommendation: AggregatedCodeScanIssue, isAutoScope?: boolean) {
    if (isAutoScope) {
        SecurityIssueProvider.instance.mergeIssues(securityRecommendation)
    } else {
        const updatedSecurityRecommendationList = [
            ...SecurityIssueProvider.instance.issues.filter(
                (group) => group.filePath !== securityRecommendation.filePath
            ),
            securityRecommendation,
        ]
        SecurityIssueProvider.instance.issues = updatedSecurityRecommendationList
    }
    SecurityIssueTreeViewProvider.instance.refresh()
}

export function updateSecurityDiagnosticCollection(securityRecommendation: AggregatedCodeScanIssue) {
    const filePath = securityRecommendation.filePath
    const uri = vscode.Uri.file(filePath)
    const securityDiagnosticCollection = createSecurityDiagnosticCollection()
    const securityDiagnostics: vscode.Diagnostic[] = vscode.languages
        .getDiagnostics(uri)
        .filter((diagnostic) => diagnostic.source === codewhispererDiagnosticSourceLabel)
    for (const securityIssue of securityRecommendation.issues) {
        const existingDiagnosticIndex = securityDiagnostics.findIndex(
            (diagnostic) =>
                (diagnostic.message === securityIssue.title &&
                    diagnostic.range.start.line === securityIssue.startLine &&
                    diagnostic.range.end.line === securityIssue.endLine) ||
                (diagnostic.message === 'Re-scan to validate the fix: ' + securityIssue.title &&
                    diagnostic.range.start.line === securityIssue.startLine &&
                    diagnostic.range.end.line === securityIssue.startLine)
        )
        if (existingDiagnosticIndex !== -1) {
            securityDiagnostics.splice(existingDiagnosticIndex, 1)
        }
        if (securityIssue.visible) {
            securityDiagnostics.push(createSecurityDiagnostic(securityIssue))
        }
    }
    securityDiagnosticCollection.set(uri, securityDiagnostics)
}

export function createSecurityDiagnostic(securityIssue: CodeScanIssue) {
    const range = new vscode.Range(securityIssue.startLine, 0, securityIssue.endLine, 0)
    const securityDiagnostic: SecurityDiagnostic = new vscode.Diagnostic(
        range,
        securityIssue.title,
        vscode.DiagnosticSeverity.Warning
    )
    securityDiagnostic.source = codewhispererDiagnosticSourceLabel
    securityDiagnostic.code = securityIssue.ruleId
    securityDiagnostic.findingId = securityIssue.findingId
    return securityDiagnostic
}

export function createSecurityDiagnosticCollection() {
    if (securityScanRender.securityDiagnosticCollection === undefined) {
        securityScanRender.securityDiagnosticCollection =
            vscode.languages.createDiagnosticCollection('Amazon Q Security Scan')
    }
    return securityScanRender.securityDiagnosticCollection
}

export function disposeSecurityDiagnostic(event: vscode.TextDocumentChangeEvent) {
    const uri = event.document.uri
    if (!securityScanRender.initialized || !securityScanRender.securityDiagnosticCollection?.has(uri)) {
        return
    }
    const currentSecurityDiagnostics = securityScanRender.securityDiagnosticCollection?.get(uri)
    const newSecurityDiagnostics: vscode.Diagnostic[] = []

    const { changedRange, changedText, lineOffset } = event.contentChanges.reduce(
        (acc, change) => ({
            changedRange: acc.changedRange.union(change.range),
            changedText: acc.changedText + change.text,
            lineOffset: acc.lineOffset + getLineOffset(change.range, change.text),
        }),
        {
            changedRange: event.contentChanges[0].range,
            changedText: '',
            lineOffset: 0,
        }
    )

    if (currentSecurityDiagnostics) {
        for (const issue of currentSecurityDiagnostics) {
            const intersection = changedRange.intersection(issue.range)
            if (
                issue.severity === vscode.DiagnosticSeverity.Warning &&
                intersection &&
                (/\S/.test(changedText) || changedText === '')
            ) {
                issue.severity = vscode.DiagnosticSeverity.Information
                issue.message = 'Re-scan to validate the fix: ' + issue.message
                issue.range = new vscode.Range(intersection.start, intersection.start)
            } else if (issue.range.start.line >= changedRange.end.line) {
                issue.range = new vscode.Range(
                    issue.range.start.line + lineOffset,
                    issue.range.start.character,
                    issue.range.end.line + lineOffset,
                    issue.range.end.character
                )
            }
            newSecurityDiagnostics.push(issue)
        }
    }
    securityScanRender.securityDiagnosticCollection?.set(uri, newSecurityDiagnostics)
}

function getLineOffset(range: vscode.Range, text: string) {
    const originLines = range.end.line - range.start.line + 1
    const changedLines = text.split('\n').length
    return changedLines - originLines
}

export function removeDiagnostic(uri: vscode.Uri, issue: CodeScanIssue) {
    const currentSecurityDiagnostics = securityScanRender.securityDiagnosticCollection?.get(uri)
    if (currentSecurityDiagnostics) {
        const newSecurityDiagnostics = currentSecurityDiagnostics.filter((diagnostic: SecurityDiagnostic) => {
            return diagnostic.findingId !== issue.findingId
        })
        securityScanRender.securityDiagnosticCollection?.set(uri, newSecurityDiagnostics)
    }
}
