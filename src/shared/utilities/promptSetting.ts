/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { SettingsConfiguration } from '../settingsConfiguration'

export type PROMPT_NAME =
    | 'warnBeforeRunCommand'
    | 'warnBeforeEnablingExcecuteCommand'
    | 'warnBeforeDisablingExecuteCommand'
export const DEFAULT_PROMPTS: PromptSetting = {
    warnBeforeRunCommand: true,
    warnBeforeEnablingExcecuteCommand: true,
    warnBeforeDisablingExecuteCommand: true,
}

export interface PromptSetting {
    [promptName: string]: boolean
}

export function disablePrompt(promptName: PROMPT_NAME, settings: SettingsConfiguration): void {
    try {
        let prompts = settings.readSetting<PromptSetting>('togglePrompts', DEFAULT_PROMPTS)

        prompts[promptName] = false
        settings.writeSetting('togglePrompts', prompts, vscode.ConfigurationTarget.Global)
    } catch (e) {
        getLogger().error('Diabling Prompts setting failed to update', e)
    }
}

export function readPromptSetting(promptName: PROMPT_NAME, settings: SettingsConfiguration): boolean {
    const promptSetting = settings.readSetting('togglePrompts', DEFAULT_PROMPTS)
    return promptSetting[promptName]
}
