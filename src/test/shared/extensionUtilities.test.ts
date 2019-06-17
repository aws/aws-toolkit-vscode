/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { convertPathTokensToPath, safeGet } from '../../shared/extensionUtilities'

describe('extensionUtilities', () => {
    describe('safeGet', () => {

        class Blah {
            public someProp?: string

            public constructor(someProp?: string) {
                this.someProp = someProp
            }
        }

        it('can access sub-property', () => {
            assert.strictEqual(safeGet(new Blah('hello!'), x => x.someProp), 'hello!')
            assert.strictEqual(safeGet(new Blah(), x => x.someProp), undefined)
            assert.strictEqual(safeGet(undefined as Blah | undefined, x => x.someProp), undefined)
        })
    })

    describe('convertPathTokensToPath', () => {
        it ('converts default `!!EXTENSIONROOT!!` tokens to a VS Code-styled path', () => {
            const baseText = 'Here is my path: '
            const text = baseText + '!!EXTENSIONROOT!!'
            const path = '/my/path'
            const replacedText = convertPathTokensToPath(path, text)

            assert.strictEqual(replacedText, `${baseText}vscode-resource:${path}`)
        })

        it ('converts arbitrary tokens to a relative path', () => {
            const baseText = 'Here is my path: '
            const token = 'hi-de-ho'
            const text = baseText + token
            const path = '/my/path'
            const replacedText = convertPathTokensToPath(path, text, token)

            assert.strictEqual(replacedText, `${baseText}vscode-resource:${path}`)
        })
    })
})
