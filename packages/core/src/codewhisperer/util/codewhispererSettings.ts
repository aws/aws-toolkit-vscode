/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ArrayConstructor } from '../../shared/utilities/typeConstructors'
import { fromExtensionManifest, migrateSetting } from '../../shared/settings'

const description = {
    showCodeWithReferences: Boolean,
    importRecommendationForInlineCodeSuggestions: Boolean, // eslint-disable-line id-length
    shareContentWithAWS: Boolean,
    workspaceIndex: Boolean,
    workspaceIndexWorkerThreads: Number,
    workspaceIndexUseGPU: Boolean,
    workspaceIndexMaxSize: Number,
    workspaceIndexMaxFileSize: Number,
    workspaceIndexCacheDirPath: String,
    workspaceIndexIgnoreFilePatterns: ArrayConstructor(String),
    allowFeatureDevelopmentToRunCodeAndTests: Object,
    ignoredSecurityIssues: ArrayConstructor(String),
}

export class CodeWhispererSettings extends fromExtensionManifest('amazonQ', description) {
    // TODO: Remove after a few releases
    public async importSettings() {
        await migrateSetting(
            { key: 'amazonQ.showInlineCodeSuggestionsWithCodeReferences', type: Boolean },
            { key: 'amazonQ.showCodeWithReferences' }
        )
    }
    public isSuggestionsWithCodeReferencesEnabled(): boolean {
        return this.get(`showCodeWithReferences`, false)
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
        return Math.max(this.get('workspaceIndexMaxSize', 2048), 1)
    }

    public getMaxIndexFileSize(): number {
        // minimal 1MB
        return Math.max(this.get('workspaceIndexMaxFileSize', 10), 1)
    }

    public getIndexCacheDirPath(): string {
        return this.get('workspaceIndexCacheDirPath', '')
    }

    public getIndexIgnoreFilePatterns(): string[] {
        return this.get('workspaceIndexIgnoreFilePatterns', [])
    }

    public getAutoBuildSetting(): { [key: string]: boolean } {
        return this.get('allowFeatureDevelopmentToRunCodeAndTests', {})
    }

    public async updateAutoBuildSetting(projectName: string, setting: boolean) {
        const projects = this.getAutoBuildSetting()

        projects[projectName] = setting

        await this.update('allowFeatureDevelopmentToRunCodeAndTests', projects)
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
