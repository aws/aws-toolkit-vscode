/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { fromExtensionManifest, migrateSetting } from '../../shared/settings'
import globals from '../../shared/extensionGlobals'
import { codewhispererSettingsImportedKey } from '../models/constants'

const description = {
    showInlineCodeSuggestionsWithCodeReferences: Boolean, // eslint-disable-line id-length
    importRecommendationForInlineCodeSuggestions: Boolean, // eslint-disable-line id-length
    shareContentWithAWS: Boolean,
}

export class CodeWhispererSettings extends fromExtensionManifest('amazonQ', description) {
    public async importSettings() {
        if (globals.context.globalState.get<boolean>(codewhispererSettingsImportedKey)) {
            return
        }

        await migrateSetting(
            { key: 'aws.codeWhisperer.includeSuggestionsWithCodeReferences', type: Boolean },
            { key: 'amazonQ.showInlineCodeSuggestionsWithCodeReferences' }
        )
        await migrateSetting(
            { key: 'aws.codeWhisperer.importRecommendation', type: Boolean },
            { key: 'amazonQ.importRecommendationForInlineCodeSuggestions' }
        )
        await migrateSetting(
            { key: 'aws.codeWhisperer.shareCodeWhispererContentWithAWS', type: Boolean },
            { key: 'amazonQ.shareContentWithAWS' }
        )

        await globals.context.globalState.update(codewhispererSettingsImportedKey, true)
    }

    public isSuggestionsWithCodeReferencesEnabled(): boolean {
        return this.get(`showInlineCodeSuggestionsWithCodeReferences`, false)
    }
    public isImportRecommendationEnabled(): boolean {
        return this.get(`importRecommendationForInlineCodeSuggestions`, false)
    }

    public isOptoutEnabled(): boolean {
        const value = this.get('shareContentWithAWS', true)
        return !value
    }

    static #instance: CodeWhispererSettings

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
