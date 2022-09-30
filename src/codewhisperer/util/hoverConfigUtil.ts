/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import { Settings } from '../../shared/settings'

export class HoverConfigUtil extends Settings.define('editor', { 'hover.enabled': Boolean }) {
    // disable hover popup when inline suggestion is active
    // this is because native popup Next/Previous button have bug that removes active inline suggestion
    // this class can be removed once inlineCompletionAdditions API is available

    public constructor(private readonly globalState = globals.context.globalState, settings = Settings.instance) {
        super(settings)
    }

    static #instance: HoverConfigUtil

    public static get instance() {
        return (this.#instance ??= new this())
    }

    async overwriteHoverConfig() {
        if (this.get('hover.enabled', false)) {
            await this.globalState.update('settings.editor.hover.enabled', true)
            await this.update('hover.enabled', false)
        }
    }

    async restoreHoverConfig() {
        if (this.globalState.get('settings.editor.hover.enabled')) {
            await this.update('hover.enabled', true)
            await this.globalState.update('settings.editor.hover.enabled', undefined)
        }
    }
}
