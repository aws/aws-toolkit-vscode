/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { fromExtensionManifest } from '../../shared/settings'
import { ArrayConstructor } from '../../shared/utilities/typeConstructors'

const description = {
    showInlineCodeSuggestionsWithCodeReferences: Boolean, // eslint-disable-line id-length
    importRecommendationForInlineCodeSuggestions: Boolean, // eslint-disable-line id-length
    shareContentWithAWS: Boolean,
    workspaceIndex: Boolean,
    workspaceIndexWorkerThreads: Number,
    workspaceIndexUseGPU: Boolean,
    workspaceIndexMaxSize: Number,
    ignoredSecurityIssues: ArrayConstructor(String),
}

export class CodeWhispererSettings extends fromExtensionManifest('amazonQ', description) {
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

    public getIgnoredSecurityIssues(): string[] {
        return this.get('ignoredSecurityIssues', [])
    }

    public async addToIgnoredSecurityIssuesList(issueTitle: string) {
        await this.update('ignoredSecurityIssues', [...this.getIgnoredSecurityIssues(), issueTitle])
    }

    static #instance: CodeWhispererSettings

    public static get instance() {
        return (this.#instance ??= new this())
    }
}
