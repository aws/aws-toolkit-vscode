/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { DocumentManager, DocumentMetadata } from '../../../../awsService/cloudformation/documents/documentManager'
import { LanguageClient } from 'vscode-languageclient/node'

function createMetadata(overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
    return {
        uri: 'file:///template.yaml',
        fileName: 'template.yaml',
        ext: 'yaml',
        type: 'yaml',
        cfnType: 'template',
        languageId: 'yaml',
        version: 1,
        lineCount: 10,
        sizeBytes: 100,
        ...overrides,
    }
}

describe('DocumentManager', function () {
    let sandbox: sinon.SinonSandbox
    let documentManager: DocumentManager
    let notificationCallback: (docs: DocumentMetadata[]) => void

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        const fakeClient = {
            onNotification: (_type: unknown, callback: (docs: DocumentMetadata[]) => void) => {
                notificationCallback = callback
            },
        } as unknown as LanguageClient
        documentManager = new DocumentManager(fakeClient)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('requiresS3Upload', function () {
        it('returns false when document is not found', function () {
            notificationCallback([createMetadata()])

            assert.strictEqual(documentManager.requiresS3Upload('file:///nonexistent.yaml'), false)
        })

        it('returns false when template size is at the limit', function () {
            notificationCallback([createMetadata({ sizeBytes: 51_200 })])

            assert.strictEqual(documentManager.requiresS3Upload('file:///template.yaml'), false)
        })

        it('returns true when template size exceeds the limit', function () {
            notificationCallback([createMetadata({ sizeBytes: 51_201 })])

            assert.strictEqual(documentManager.requiresS3Upload('file:///template.yaml'), true)
        })

        it('returns false when no documents have been received', function () {
            assert.strictEqual(documentManager.requiresS3Upload('file:///template.yaml'), false)
        })
    })
})
