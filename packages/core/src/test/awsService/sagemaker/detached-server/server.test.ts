/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ideProcessPatterns } from '../../../../awsService/sagemaker/detached-server/server'

describe('ideProcessPatterns', () => {
    describe('darwin pattern', () => {
        it('matches VS Code with Electron', () => {
            const line = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'
            assert.strictEqual(ideProcessPatterns.darwin.test(line), true)
        })

        it('matches VS Code with Code', () => {
            const line = '/Applications/Visual Studio Code.app/Contents/MacOS/Code'
            assert.strictEqual(ideProcessPatterns.darwin.test(line), true)
        })

        it('matches VS Code Insiders with Electron', () => {
            const line = '/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron'
            assert.strictEqual(ideProcessPatterns.darwin.test(line), true)
        })

        it('matches Cursor with Electron', () => {
            const line = '/Applications/Cursor.app/Contents/MacOS/Electron'
            assert.strictEqual(ideProcessPatterns.darwin.test(line), true)
        })

        it('matches Kiro with Electron', () => {
            const line = '/Applications/Kiro.app/Contents/MacOS/Electron'
            assert.strictEqual(ideProcessPatterns.darwin.test(line), true)
        })

        it('matches Windsurf with Electron', () => {
            const line = '/Applications/Windsurf.app/Contents/MacOS/Electron'
            assert.strictEqual(ideProcessPatterns.darwin.test(line), true)
        })

        it('does not match unrelated processes', () => {
            const line = '/usr/bin/python3'
            assert.strictEqual(ideProcessPatterns.darwin.test(line), false)
        })
    })

    describe('windows pattern', () => {
        it('matches Code.exe', () => {
            assert.strictEqual(ideProcessPatterns.windows.test('Code.exe'), true)
        })

        it('matches Cursor.exe', () => {
            assert.strictEqual(ideProcessPatterns.windows.test('Cursor.exe'), true)
        })

        it('matches Kiro.exe', () => {
            assert.strictEqual(ideProcessPatterns.windows.test('Kiro.exe'), true)
        })

        it('matches Windsurf.exe', () => {
            assert.strictEqual(ideProcessPatterns.windows.test('Windsurf.exe'), true)
        })
    })

    describe('linux pattern', () => {
        it('matches code', () => {
            assert.strictEqual(ideProcessPatterns.linux.test('code'), true)
        })

        it('matches cursor', () => {
            assert.strictEqual(ideProcessPatterns.linux.test('cursor'), true)
        })

        it('matches kiro', () => {
            assert.strictEqual(ideProcessPatterns.linux.test('kiro'), true)
        })

        it('matches windsurf', () => {
            assert.strictEqual(ideProcessPatterns.linux.test('windsurf'), true)
        })

        it('matches electron', () => {
            assert.strictEqual(ideProcessPatterns.linux.test('electron'), true)
        })
    })
})
