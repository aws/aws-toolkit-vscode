/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { getLogger } from '../../shared/logger/logger'
import * as CodeWhispererConstants from '../models/constants'
/**
 * Override keybindings for next, previous suggestion
 * only when user did not set those keybindings
 */
export function overrideKeybindings() {
    let origin = ''
    const keybindingsPath = getKeybindingsPath()
    try {
        origin = fs.readFileSync(keybindingsPath, 'utf8')
    } catch (error) {
        getLogger().error(`Failed to read user keybinding file ${error}`)
    }
    try {
        let overrides = ''
        const sep = '        '
        if (!origin.includes(`editor.action.inlineSuggest.showNext`)) {
            overrides += `${sep}{\n${sep}${sep}"key": "right",\n${sep}${sep}"command": "editor.action.inlineSuggest.showNext",\n${sep}${sep}"when": "inlineSuggestionVisible && !editorReadonly"\n${sep}},\n`
            overrides += `${sep}{\n${sep}${sep}"key": "alt+]",\n${sep}${sep}"command": "-editor.action.inlineSuggest.showNext",\n${sep}${sep}"when": "inlineSuggestionVisible && !editorReadonly"\n${sep}},\n`
        }
        if (!origin.includes(`editor.action.inlineSuggest.showPrevious`)) {
            overrides += `${sep}{\n${sep}${sep}"key": "left",\n${sep}${sep}"command": "editor.action.inlineSuggest.showPrevious",\n${sep}${sep}"when": "inlineSuggestionVisible && !editorReadonly"\n${sep}},\n`
            overrides += `${sep}{\n${sep}${sep}"key": "alt+[",\n${sep}${sep}"command": "-editor.action.inlineSuggest.showPrevious",\n${sep}${sep}"when": "inlineSuggestionVisible && !editorReadonly"\n${sep}},\n`
        }

        if (overrides.length > 0) {
            let newKeybindings = ''
            if (origin.includes('[') && origin.includes(']')) {
                newKeybindings = overrides + origin.substring(origin.indexOf('[') + 1, origin.lastIndexOf(']'))
            } else {
                newKeybindings = overrides.slice(0, -2) + '\n'
            }
            fs.writeFileSync(keybindingsPath, `[\n${newKeybindings}]`)
        }
    } catch (error) {
        getLogger().error(`Failed to update user keybindings, error ${error}`)
    }
}

export function getKeybindingsPath(): string {
    const home = os.homedir()
    if (process.platform === 'win32') {
        return path.join(home, CodeWhispererConstants.keyBindingPathWin)
    } else if (process.platform === 'darwin') {
        return path.join(home, CodeWhispererConstants.keyBindingPathMac)
    } else {
        return path.join(home, CodeWhispererConstants.keyBindingPathLinux)
    }
}
