/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { fromExtensionManifest } from '../../../shared/settings'

let localize: nls.LocalizeFunc

export class ConsolasSettings extends fromExtensionManifest('aws.experiments', { consolas: Boolean }) {
    private CONSOLAS_SETTING_ENABLED_DEFAULT = false
    public isEnabled(): boolean {
        try {
            return this.get('consolas', this.CONSOLAS_SETTING_ENABLED_DEFAULT)
        } catch (error) {
            vscode.window.showErrorMessage(
                localize(
                    'AWS.message.error.settings.consolas.invalid_type',
                    'The aws.experiments.consolas value must be a boolean'
                )
            )
            return this.CONSOLAS_SETTING_ENABLED_DEFAULT
        }
    }
}
