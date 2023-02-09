/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { fromExtensionManifest } from '../../shared/settings'

const description = {
    includeSuggestionsWithCodeReferences: Boolean,
    shareCodeWhispererContentWithAWS: Boolean,
}
export class CodeWhispererSettings extends fromExtensionManifest('aws.codeWhisperer', description) {
    public isSuggestionsWithCodeReferencesEnabled(): boolean {
        return this.get(`includeSuggestionsWithCodeReferences`, false)
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
