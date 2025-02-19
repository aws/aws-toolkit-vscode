/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon'
import assert from 'assert'
import vscode from 'vscode'
import {
    detectCommentAboveLine,
    getLanguageCommentConfig,
    insertCommentAboveLine,
} from '../../../shared/utilities/commentUtils'
import { createMockDocument } from '../../codewhisperer/testUtil'

describe('CommentUtils', function () {
    let sandbox: sinon.SinonSandbox
    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('getLanguageCommentConfig', function () {
        it('should get comment config for a given languageId', function () {
            assert.equal(getLanguageCommentConfig('java').lineComment, '//')
            assert.equal(getLanguageCommentConfig('python').lineComment, '#')
            assert.equal(getLanguageCommentConfig('javascript').lineComment, '//')
            assert.deepEqual(getLanguageCommentConfig('xml').blockComment, ['<!--', '-->'])
        })

        it('should handle invalid languageIds', function () {
            assert.deepEqual(getLanguageCommentConfig('invalid'), {})
        })
    })

    describe('detectCommentAboveLine', function () {
        it('should return true if the comment exists above the line in the given document', function () {
            const document = createMockDocument('# some-comment\nfoo = 1', 'foo.py', 'python')
            assert.equal(detectCommentAboveLine(document, 1, 'some-comment'), true)
        })

        it('should fallback to block comment if line comment is not found', function () {
            const document = createMockDocument("''' some-comment '''\nfoo = 1", 'foo.py', 'python')
            assert.equal(detectCommentAboveLine(document, 1, 'some-comment'), true)
        })

        it('should allow empty lines in between the line and the comment', function () {
            const document = createMockDocument('# some-comment\n\n\nfoo = 1', 'foo.py', 'python')
            assert.equal(detectCommentAboveLine(document, 3, 'some-comment'), true)
        })

        it('should return false if the comment is not found', function () {
            const document = createMockDocument('foo = 1\nbar = 2', 'foo.py', 'python')
            assert.equal(detectCommentAboveLine(document, 2, 'some-comment'), false)
        })

        it('should return false for invalid inputs', function () {
            const document = createMockDocument('# some-comment\nfoo = 1', 'foo.py', 'python')
            assert.equal(detectCommentAboveLine(document, -1, 'some-comment'), false)
        })
    })

    describe('insertCommentAboveLine', function () {
        let insertMock: sinon.SinonStub
        let applyEditMock: sinon.SinonStub

        beforeEach(function () {
            insertMock = sandbox.stub()
            applyEditMock = sandbox.stub()
        })

        it('should insert the comment above the line in the given document', function () {
            sandbox.stub(vscode.WorkspaceEdit.prototype, 'insert').value(insertMock)
            sandbox.stub(vscode.workspace, 'applyEdit').value(applyEditMock)

            const document = createMockDocument('foo = 1\nbar = 2', 'foo.py', 'python')
            insertCommentAboveLine(document, 1, 'some-comment')
            assert.ok(insertMock.calledOnceWith(document.uri, new vscode.Position(0, 0), '\n# some-comment'))
        })

        it('should indent the comment by the same amount as the current line', function () {
            sandbox.stub(vscode.WorkspaceEdit.prototype, 'insert').value(insertMock)
            sandbox.stub(vscode.workspace, 'applyEdit').value(applyEditMock)

            const document = createMockDocument('    foo = 1\n    bar = 2', 'foo.py', 'python')
            insertCommentAboveLine(document, 1, 'some-comment')
            assert.ok(insertMock.calledOnceWith(document.uri, new vscode.Position(0, 0), '\n    # some-comment'))
        })

        it('should fallback to block comment if line comment is undefined', function () {
            sandbox.stub(vscode.WorkspaceEdit.prototype, 'insert').value(insertMock)
            sandbox.stub(vscode.workspace, 'applyEdit').value(applyEditMock)

            const document = createMockDocument('<aaa>\n  <bbb></bbb>\n</aaa>', 'foo.xml', 'xml')
            insertCommentAboveLine(document, 1, 'some-comment')
            assert.ok(insertMock.calledOnceWith(document.uri, new vscode.Position(0, 0), '\n  <!-- some-comment -->'))
        })
    })
})
