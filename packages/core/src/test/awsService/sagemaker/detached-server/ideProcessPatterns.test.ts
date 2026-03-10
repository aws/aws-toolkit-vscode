/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'

describe('detached-server IDE process patterns', function () {
    // These patterns are from server.ts
    const ideProcessPatterns = {
        windows: /Code\.exe|Cursor\.exe|Kiro\.exe|Windsurf\.exe/i,
        darwin: /(Visual Studio Code( - Insiders)?|Cursor|Kiro|Windsurf)\.app\/Contents\/MacOS\/(Electron|Code)/,
        linux: /^(code(-insiders)?|cursor|kiro|windsurf|electron)$/i,
    }

    describe('Windows patterns', function () {
        it('matches Code.exe', function () {
            assert.ok(ideProcessPatterns.windows.test('Code.exe'))
        })

        it('matches Cursor.exe', function () {
            assert.ok(ideProcessPatterns.windows.test('Cursor.exe'))
        })

        it('matches Kiro.exe', function () {
            assert.ok(ideProcessPatterns.windows.test('Kiro.exe'))
        })

        it('matches Windsurf.exe', function () {
            assert.ok(ideProcessPatterns.windows.test('Windsurf.exe'))
        })

        it('is case insensitive', function () {
            assert.ok(ideProcessPatterns.windows.test('code.exe'))
            assert.ok(ideProcessPatterns.windows.test('CURSOR.EXE'))
        })

        it('does not match other executables', function () {
            assert.ok(!ideProcessPatterns.windows.test('notepad.exe'))
            assert.ok(!ideProcessPatterns.windows.test('chrome.exe'))
        })
    })

    describe('macOS patterns', function () {
        it('matches Visual Studio Code with Electron', function () {
            assert.ok(ideProcessPatterns.darwin.test('Visual Studio Code.app/Contents/MacOS/Electron'))
        })

        it('matches Visual Studio Code with Code', function () {
            assert.ok(ideProcessPatterns.darwin.test('Visual Studio Code.app/Contents/MacOS/Code'))
        })

        it('matches Visual Studio Code - Insiders with Electron', function () {
            assert.ok(ideProcessPatterns.darwin.test('Visual Studio Code - Insiders.app/Contents/MacOS/Electron'))
        })

        it('matches Visual Studio Code - Insiders with Code', function () {
            assert.ok(ideProcessPatterns.darwin.test('Visual Studio Code - Insiders.app/Contents/MacOS/Code'))
        })

        it('matches Cursor with Electron', function () {
            assert.ok(ideProcessPatterns.darwin.test('Cursor.app/Contents/MacOS/Electron'))
        })

        it('matches Cursor with Code', function () {
            assert.ok(ideProcessPatterns.darwin.test('Cursor.app/Contents/MacOS/Code'))
        })

        it('matches Kiro with Electron', function () {
            assert.ok(ideProcessPatterns.darwin.test('Kiro.app/Contents/MacOS/Electron'))
        })

        it('matches Kiro with Code', function () {
            assert.ok(ideProcessPatterns.darwin.test('Kiro.app/Contents/MacOS/Code'))
        })

        it('matches Windsurf with Electron', function () {
            assert.ok(ideProcessPatterns.darwin.test('Windsurf.app/Contents/MacOS/Electron'))
        })

        it('matches Windsurf with Code', function () {
            assert.ok(ideProcessPatterns.darwin.test('Windsurf.app/Contents/MacOS/Code'))
        })

        it('does not match incorrect paths', function () {
            assert.ok(!ideProcessPatterns.darwin.test('Visual Studio Code.app/Contents/MacOS/Helper'))
            assert.ok(!ideProcessPatterns.darwin.test('Chrome.app/Contents/MacOS/Chrome'))
        })

        it('does not match without proper app structure', function () {
            assert.ok(!ideProcessPatterns.darwin.test('Cursor'))
            assert.ok(!ideProcessPatterns.darwin.test('Code'))
        })
    })

    describe('Linux patterns', function () {
        it('matches code', function () {
            assert.ok(ideProcessPatterns.linux.test('code'))
        })

        it('matches code-insiders', function () {
            assert.ok(ideProcessPatterns.linux.test('code-insiders'))
        })

        it('matches cursor', function () {
            assert.ok(ideProcessPatterns.linux.test('cursor'))
        })

        it('matches kiro', function () {
            assert.ok(ideProcessPatterns.linux.test('kiro'))
        })

        it('matches windsurf', function () {
            assert.ok(ideProcessPatterns.linux.test('windsurf'))
        })

        it('matches electron', function () {
            assert.ok(ideProcessPatterns.linux.test('electron'))
        })

        it('is case insensitive', function () {
            assert.ok(ideProcessPatterns.linux.test('CODE'))
            assert.ok(ideProcessPatterns.linux.test('CURSOR'))
        })

        it('requires exact match (start and end)', function () {
            assert.ok(!ideProcessPatterns.linux.test('mycode'))
            assert.ok(!ideProcessPatterns.linux.test('cursor-helper'))
        })

        it('does not match other processes', function () {
            assert.ok(!ideProcessPatterns.linux.test('bash'))
            assert.ok(!ideProcessPatterns.linux.test('node'))
        })
    })

    describe('real-world process strings', function () {
        it('matches typical macOS ps output for VS Code', function () {
            const psLine = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'
            assert.ok(ideProcessPatterns.darwin.test(psLine))
        })

        it('matches typical macOS ps output for Cursor', function () {
            const psLine = '/Applications/Cursor.app/Contents/MacOS/Code'
            assert.ok(ideProcessPatterns.darwin.test(psLine))
        })

        it('matches typical Windows tasklist output', function () {
            const tasklistLine = 'Code.exe                     12345 Console                    1    123,456 K'
            assert.ok(ideProcessPatterns.windows.test(tasklistLine))
        })

        it('matches typical Linux ps output', function () {
            const psLine = 'code'
            assert.ok(ideProcessPatterns.linux.test(psLine.trim()))
        })
    })
})
