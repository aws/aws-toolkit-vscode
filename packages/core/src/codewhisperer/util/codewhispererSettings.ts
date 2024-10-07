/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { fromExtensionManifest, migrateSetting } from '../../shared/settings'

const description = {
    showInlineCodeSuggestionsWithCodeReferences: Boolean, // eslint-disable-line id-length
    importRecommendationForInlineCodeSuggestions: Boolean, // eslint-disable-line id-length
    shareContentWithAWS: Boolean,
    workspaceIndex: Boolean,
    workspaceIndexWorkerThreads: Number,
    workspaceIndexUseGPU: Boolean,
    workspaceIndexMaxSize: Number,
}

export class CodeWhispererSettings extends fromExtensionManifest('amazonQ', description) {
    // TODO: Remove after a few releases
    public async importSettings() {
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
    public isLocalIndexEnabled(): boolean {
        return this.get('workspaceIndex', false)
    }

    public async enableLocalIndex() {
        await this.update('workspaceIndex', true)
    }

    public isLocalIndexGPUEnabled(): boolean {
        return this.get('workspaceIndexUseGPU', false)
    }

    public getIndexWorkerThreads(): number {
        // minimal 0 threads
        return Math.max(this.get('workspaceIndexWorkerThreads', 0), 0)
    }

    public getMaxIndexSize(): number {
        // minimal 1MB
        return Math.max(this.get('workspaceIndexMaxSize', 250), 1)
    }

    static #instance: CodeWhispererSettings

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
