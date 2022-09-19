/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as assert from 'assert'
import { overrideKeybindings, getKeybindingsPath } from '../../../codewhisperer/util/keybindingUtil'
describe('keybindingUtil', function () {
    before(async function () {
        try {
            await fs.mkdirp(getKeybindingsPath().replace('keybindings.json', ''))
            fs.writeFileSync(getKeybindingsPath(), ``)
        } catch (e) {}
    })

    it('Should override keybindings of inline completion commands if user has not overwritten it', function () {
        overrideKeybindings()
        const actual = fs.readFileSync(getKeybindingsPath(), 'utf8')
        const actualJson = JSON.parse(actual)
        assert.strictEqual(actualJson[0]['key'], 'right')
        assert.strictEqual(actualJson[0]['command'], 'editor.action.inlineSuggest.showNext')
        assert.strictEqual(actualJson[2]['key'], 'left')
        assert.strictEqual(actualJson[2]['command'], 'editor.action.inlineSuggest.showPrevious')
    })

    it('Should only override some inline completion commands if user has not overwritten it', function () {
        const origin = `[
        {
                "key": "cmd+3",
                "command": "editor.action.inlineSuggest.showNext",
                "when": "inlineSuggestionVisible && !editorReadonly"
        },
        {
                "key": "alt+]",
                "command": "-editor.action.inlineSuggest.showNext",
                "when": "inlineSuggestionVisible && !editorReadonly"
        }
    ]`
        fs.writeFileSync(getKeybindingsPath(), origin)
        overrideKeybindings()
        const actual = fs.readFileSync(getKeybindingsPath(), 'utf8')
        const actualJson = JSON.parse(actual)
        assert.strictEqual(actualJson[0]['key'], 'left')
        assert.strictEqual(actualJson[0]['command'], 'editor.action.inlineSuggest.showPrevious')
        assert.strictEqual(actualJson[2]['key'], 'cmd+3')
        assert.strictEqual(actualJson[2]['command'], 'editor.action.inlineSuggest.showNext')
    })

    it('Should not override any inline completion commands if user has overwritten it', function () {
        const origin = `[
        {
                "key": "right",
                "command": "editor.action.inlineSuggest.showNext",
                "when": "inlineSuggestionVisible && !editorReadonly"
        },
        {
                "key": "alt+]",
                "command": "-editor.action.inlineSuggest.showNext",
                "when": "inlineSuggestionVisible && !editorReadonly"
        },
        {
                "key": "left",
                "command": "editor.action.inlineSuggest.showPrevious",
                "when": "inlineSuggestionVisible && !editorReadonly"
        },
        {
                "key": "alt+[",
                "command": "-editor.action.inlineSuggest.showPrevious",
                "when": "inlineSuggestionVisible && !editorReadonly"
        },
        {
                "key": "tab",
                "command": "aws.codeWhisperer.acceptCodeSuggestion",
                "when": "CODEWHISPERER_SERVICE_ACTIVE && editorTextFocus"
        },
        {
                "key": "tab",
                "command": "-aws.codeWhisperer.acceptCodeSuggestion",
                "when": "CODEWHISPERER_SERVICE_ACTIVE && editorTextFocus"
        }
]`
        fs.writeFileSync(getKeybindingsPath(), origin)
        overrideKeybindings()
        const actual = fs.readFileSync(getKeybindingsPath(), 'utf8')
        assert.strictEqual(actual, origin)
    })

    it('Should not remove other keybindings', function () {
        const origin = `[
    {
        "key": "7",
        "command": "workbench.action.debug.continue",
        "when": "debugState == 'stopped'"
    },
    {
        "key": "f5",
        "command": "-workbench.action.debug.continue",
        "when": "debugState == 'stopped'"
    }
]`
        fs.writeFileSync(getKeybindingsPath(), origin)
        overrideKeybindings()
        const actual = fs.readFileSync(getKeybindingsPath(), 'utf8')
        const actualJson = JSON.parse(actual)
        assert.strictEqual(actualJson[0]['key'], 'right')
        assert.strictEqual(actualJson[0]['command'], 'editor.action.inlineSuggest.showNext')
        assert.strictEqual(actualJson[2]['key'], 'left')
        assert.strictEqual(actualJson[2]['command'], 'editor.action.inlineSuggest.showPrevious')
        assert.strictEqual(actualJson[4]['key'], '7')
        assert.strictEqual(actualJson[4]['command'], 'workbench.action.debug.continue')
        assert.strictEqual(actualJson[5]['key'], 'f5')
        assert.strictEqual(actualJson[5]['command'], '-workbench.action.debug.continue')
    })
})
