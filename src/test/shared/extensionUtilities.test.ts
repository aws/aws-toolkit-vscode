/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { mostRecentVersionKey, pluginVersion } from '../../shared/constants'
import {
    convertPathTokensToPath,
    isDifferentVersion,
    safeGet,
    setMostRecentVersion
} from '../../shared/extensionUtilities'
import { FakeExtensionContext } from '../fakeExtensionContext'

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
            const replacedText = convertPathTokensToPath(path, text, new RegExp(token, 'g'))

            assert.strictEqual(replacedText, `${baseText}vscode-resource:${path}`)
        })
    })

    describe('isDifferentVersion', () => {
        it ('returns false if the version exists, is a semver, and matches the existing version exactly', () => {
            const goodVersion = '1.2.3'
            const extContext = new FakeExtensionContext()
            extContext.globalState.update(mostRecentVersionKey, goodVersion)

            assert.strictEqual(isDifferentVersion(extContext, goodVersion), false)
        })

        it ('returns true if a most recent version isn\'t set', () => {
            const extContext = new FakeExtensionContext()

            assert.ok(isDifferentVersion(extContext))
        })

        it ('returns true if a most recent version isn\'t a valid semver', () => {
            const badVersion = 'this.isnt.right'
            const extContext = new FakeExtensionContext()
            extContext.globalState.update(mostRecentVersionKey, badVersion)

            assert.ok(isDifferentVersion(extContext))
        })

        it ('returns true if a most recent version doesn\'t match the current version', () => {
            const oldVersion = '1.2.3'
            const newVersion = '4.5.6'
            const extContext = new FakeExtensionContext()
            extContext.globalState.update(mostRecentVersionKey, oldVersion)

            assert.ok(isDifferentVersion(extContext, newVersion))
        })
    })

    describe('setMostRecentVersion', () => {
        it ('sets the most recent version', () => {
            const extContext = new FakeExtensionContext()
            setMostRecentVersion(extContext)

            assert.strictEqual(extContext.globalState.get<string>(mostRecentVersionKey), pluginVersion)
        })
    })
})
