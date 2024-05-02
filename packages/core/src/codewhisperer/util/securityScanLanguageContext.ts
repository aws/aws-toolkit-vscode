/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { ConstantMap, createConstantMap } from '../../shared/utilities/tsUtils'
import * as CodeWhispererConstants from '../models/constants'

export class SecurityScanLanguageContext {
    private supportedLanguageMap: ConstantMap<CodeWhispererConstants.SecurityScanLanguageId, CodewhispererLanguage>

    constructor() {
        this.supportedLanguageMap = createConstantMap<
            CodeWhispererConstants.SecurityScanLanguageId,
            CodewhispererLanguage
        >({
            java: 'java',
            python: 'python',
            javascript: 'javascript',
            typescript: 'typescript',
            csharp: 'csharp',
            go: 'go',
            golang: 'go',
            ruby: 'ruby',
            json: 'json',
            jsonc: 'json',
            yaml: 'yaml',
            tf: 'tf',
            hcl: 'tf',
            terraform: 'tf',
            terragrunt: 'tf',
            packer: 'tf',
            plaintext: 'plaintext',
            c: 'c',
            cpp: 'cpp',
            php: 'php',
        })
    }

    public normalizeLanguage(languageId?: string): CodewhispererLanguage | undefined {
        return this.supportedLanguageMap.get(languageId)
    }

    public isLanguageSupported(languageId: string): boolean {
        const lang = this.normalizeLanguage(languageId)
        return lang !== undefined
    }
}

export const securityScanLanguageContext = new SecurityScanLanguageContext()
