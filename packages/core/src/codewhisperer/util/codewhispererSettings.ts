/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { fromExtensionManifest } from '../../shared/settings'

const description = {
    includeSuggestionsWithCodeReferences: Boolean,
    importRecommendation: Boolean,
    shareCodeWhispererContentWithAWS: Boolean,
}
export class CodeWhispererSettings extends fromExtensionManifest('aws.codeWhisperer', description) {
    public isSuggestionsWithCodeReferencesEnabled(): boolean {
        return this.get(`includeSuggestionsWithCodeReferences`, false) as any
    }
    public isImportRecommendationEnabled(): boolean {
        return this.get(`importRecommendation`, false) as any
    }

    public isOptoutEnabled(): boolean {
        const value = this.get('shareCodeWhispererContentWithAWS', true)
        return !value
    }

    static #instance: CodeWhispererSettings

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
