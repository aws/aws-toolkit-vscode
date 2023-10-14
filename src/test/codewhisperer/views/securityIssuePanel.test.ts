/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import sinon from 'sinon'
import { SecurityIssuePanel } from '../../../codewhisperer/views/securityIssuePanel'
import assert from 'assert'
import { createMockWebviewPanel } from '../testUtil'
import { CodeScanIssue } from '../../../codewhisperer/models/model'

const issue: CodeScanIssue = {
    startLine: 0,
    endLine: 0,
    comment: '',
    title: '',
    description: {
        text: '',
        markdown: '',
    },
    detectorId: '',
    detectorName: '',
    relatedVulnerabilities: [],
    severity: '',
    remediation: { recommendation: { text: '', url: '' } },
}

describe('securityIssuePanel', () => {
    let mockPanel: vscode.WebviewPanel | undefined
    let createWebviewPanelStub: sinon.SinonStub | undefined

    beforeEach(() => {
        mockPanel = createMockWebviewPanel()
        createWebviewPanelStub = sinon
            .stub(vscode.window, 'createWebviewPanel')
            .callsFake(() => mockPanel as vscode.WebviewPanel)
    })

    afterEach(() => {
        sinon.restore()
        SecurityIssuePanel.instance?.dispose()
    })

    it('should create a new panel on render', () => {
        SecurityIssuePanel.render()
        assert(
            createWebviewPanelStub?.calledOnceWith(
                'aws.codeWhisperer.securityIssue',
                'CodeWhisperer Security Issue',
                vscode.ViewColumn.Beside
            )
        )
        assert.ok(!!SecurityIssuePanel.instance)
    })

    it('should update the current issue', () => {
        SecurityIssuePanel.render()

        SecurityIssuePanel.instance?.update(issue)
        assert((mockPanel?.webview.postMessage as sinon.SinonSpy).calledWith({ command: 'cache', issue }))
    })

    it('should dispose the current panel', () => {
        SecurityIssuePanel.render()
        assert.ok(!!SecurityIssuePanel.instance)

        SecurityIssuePanel.instance.dispose()
        assert((mockPanel?.dispose as sinon.SinonSpy).calledOnce)
    })
})
