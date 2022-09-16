/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Settings } from '../../shared/settings'

export class HoverConfigUtil extends Settings.define('editor', { 'hover.enabled': Boolean }) {
    // disable hover popup when inline suggestion is active
    // this is because native popup Next/Previous button have bug that removes active inline suggestion
    // this class can be removed once inlineCompletionAdditions API is available
    private userHoverEnabled?: boolean

    static #instance: HoverConfigUtil

    public static get instance() {
        return (this.#instance ??= new this())
    }

    async overwriteHoverConfig() {
        if (this.get('hover.enabled', false)) {
            await this.update('hover.enabled', false)
            this.userHoverEnabled = true
        }
    }

    async restoreHoverConfig() {
        if (this.userHoverEnabled) {
            await this.update('hover.enabled', this.userHoverEnabled)
        }
    }
}
