/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CodeScanIssue, AggregatedCodeScanIssue, CodeScansState } from '../models/model'
import { SecurityIssueHoverProvider } from './securityIssueHoverProvider'
import { SecurityIssueCodeActionProvider } from './securityIssueCodeActionProvider'
import { SecurityScanType, codewhispererDiagnosticSourceLabel } from '../models/constants'

interface SecurityScanRender {
    securityDiagnosticCollection: vscode.DiagnosticCollection | undefined
    initialized: boolean
    lastUpdated: number
}

export const securityScanRender: SecurityScanRender = {
    securityDiagnosticCollection: undefined,
    initialized: false,
    lastUpdated: 0,
}

export function initSecurityScanRender(
    securityRecommendationList: AggregatedCodeScanIssue[],
    context: vscode.ExtensionContext,
    editor: vscode.TextEditor,
    scanType: SecurityScanType,
    codeScanStartTime: number
) {
    securityScanRender.initialized = false
    if (scanType === SecurityScanType.File) {
        securityScanRender.securityDiagnosticCollection?.delete(editor.document.uri)
    } else if (scanType === SecurityScanType.Project) {
        securityScanRender.securityDiagnosticCollection?.clear()
    }
    securityRecommendationList.forEach(securityRecommendation => {
        updateSecurityDiagnosticCollection(securityRecommendation)
    })
    securityScanRender.initialized = true
    updateSecurityIssueHoverAndCodeActions(securityRecommendationList, editor)
    securityScanRender.lastUpdated = codeScanStartTime
}

function updateSecurityIssueHoverAndCodeActions(
    securityRecommendationList: AggregatedCodeScanIssue[],
    editor: vscode.TextEditor
) {
    const updatedSecurityRecommendationList = [
        ...SecurityIssueHoverProvider.instance.issues.filter(group => group.filePath !== editor.document.uri.fsPath),
        ...securityRecommendationList,
    ]
    SecurityIssueHoverProvider.instance.issues = updatedSecurityRecommendationList
    SecurityIssueCodeActionProvider.instance.issues = updatedSecurityRecommendationList
}

export function updateSecurityDiagnosticCollection(securityRecommendation: AggregatedCodeScanIssue) {
    const filePath = securityRecommendation.filePath
    const uri = vscode.Uri.file(filePath)
    const securityDiagnosticCollection = createSecurityDiagnosticCollection()
    const securityDiagnostics: vscode.Diagnostic[] = vscode.languages.getDiagnostics(uri)
    securityRecommendation.issues.forEach(securityIssue => {
        securityDiagnostics.push(createSecurityDiagnostic(securityIssue))
    })
    securityDiagnosticCollection.set(uri, securityDiagnostics)
}

export function createSecurityDiagnostic(securityIssue: CodeScanIssue) {
    const range = new vscode.Range(securityIssue.startLine, 0, securityIssue.endLine, 0)
    const securityDiagnostic: vscode.Diagnostic = new vscode.Diagnostic(
        range,
        securityIssue.title,
        vscode.DiagnosticSeverity.Warning
    )
    securityDiagnostic.source = codewhispererDiagnosticSourceLabel
    securityDiagnostic.code = {
        value: securityIssue.detectorId,
        target: vscode.Uri.parse(securityIssue.recommendation.url),
    }
    return securityDiagnostic
}

export function createSecurityDiagnosticCollection() {
    if (securityScanRender.securityDiagnosticCollection === undefined) {
        securityScanRender.securityDiagnosticCollection =
            vscode.languages.createDiagnosticCollection('CodeWhisperer Security Scan')
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
    const changedRange = event.contentChanges[0].range
    const changedText = event.contentChanges[0].text
    const lineOffset = getLineOffset(changedRange, changedText)

    currentSecurityDiagnostics?.forEach(issue => {
        const intersection = changedRange.intersection(issue.range)
        if (
            issue.severity === vscode.DiagnosticSeverity.Warning &&
            intersection &&
            (/\S/.test(changedText) || changedText === '') &&
            !CodeScansState.instance.isScansEnabled()
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
    })
    securityScanRender.securityDiagnosticCollection?.set(uri, newSecurityDiagnostics)
}

function getLineOffset(range: vscode.Range, text: string) {
    const originLines = range.end.line - range.start.line + 1
    const changedLines = text.split('\n').length
    return changedLines - originLines
}
