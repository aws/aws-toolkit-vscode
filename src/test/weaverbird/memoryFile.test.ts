/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import assert from 'assert'
import { MemoryFile, MemoryFileManagement, weaverbirdScheme } from '../../weaverbird/memoryFile'

describe('memoryFile', function () {
    const dummyPath = '/foo'
    const dummyUri = vscode.Uri.from({ scheme: weaverbirdScheme, path: dummyPath })

    describe('MemoryFileManagement', function () {
        it('should create document from file path', function () {
            const createdMemoryFile = MemoryFileManagement.createDocument(dummyPath)
            assert.deepStrictEqual(createdMemoryFile.uri, dummyUri)

            const foundMemoryFile = MemoryFileManagement.getDocument(dummyUri)
            assert.deepStrictEqual(createdMemoryFile, foundMemoryFile)
        })
    })

    describe('MemoryFile', function () {
        it('should create document from file path', function () {
            const createdMemoryFile = MemoryFile.createDocument(dummyPath)
            assert.deepStrictEqual(createdMemoryFile.uri, dummyUri)

            const foundMemoryFile = MemoryFile.getDocument(dummyUri)
            assert.deepStrictEqual(createdMemoryFile, foundMemoryFile)
        })

        it('should read and write document to file path', function () {
            const createdMemoryFile = MemoryFile.createDocument(dummyPath)
            assert.deepStrictEqual(createdMemoryFile.uri, dummyUri)

            const fakeContent = 'fee fi fo fum'
            createdMemoryFile.write(fakeContent)

            assert.deepStrictEqual(createdMemoryFile.read(), fakeContent)
        })
    })
})
