/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'

export class HoverConfigUtil {
    // disable hover popup when inline suggestion is active
    // this is because native popup Next/Previous button have bug that removes active inline suggestion
    // this class can be removed once inlineCompletionAdditions API is available
    private userHoverEnabled?: boolean

    static #instance: HoverConfigUtil

    public static get instance() {
        return (this.#instance ??= new this())
    }

    async overwriteHoverConfig() {
        try {
            const editorSettings = vscode.workspace.getConfiguration('editor')
            const hoverEnabled = editorSettings.get('hover.enabled') || false
            if (hoverEnabled) {
                await editorSettings.update('hover.enabled', false)
                this.userHoverEnabled = true
            }
        } catch (error) {
            getLogger().error(`Failed to override hover config ${error}`)
        }
    }

    async restoreHoverConfig() {
        if (this.userHoverEnabled) {
            try {
                await vscode.workspace.getConfiguration('editor').update('hover.enabled', this.userHoverEnabled)
            } catch (error) {
                getLogger().error(`Failed to restore hover config ${error}`)
            }
        }
    }
}
