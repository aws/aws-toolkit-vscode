/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import * as CodeWhispererConstants from '../models/constants'

interface RuntimeLanguageContextData {
    /**
     * collection of all language runtime versions
     */
    languageContexts: {
        [language in CodewhispererLanguage as string]: {
            /**
             * the language of the current file
             */
            language: CodewhispererLanguage
        }
    }
}

export class RuntimeLanguageContext {
    private runtimeLanguageContext: RuntimeLanguageContextData = {
        languageContexts: {
            ['plaintext']: {
                language: 'plaintext',
            },
            ['java']: {
                language: 'java',
            },
            ['python']: {
                language: 'python',
            },
            ['javascript']: {
                language: 'javascript',
            },
        },
    }

    public getLanguageContext(languageId?: string) {
        const languageName = this.convertLanguage(languageId)
        if (languageName in this.runtimeLanguageContext.languageContexts) {
            return this.runtimeLanguageContext.languageContexts[languageName]
        }
        return {
            language: languageName as CodewhispererLanguage,
        }
    }

    public convertLanguage(languageId?: string) {
        languageId = languageId === CodeWhispererConstants.typescript ? CodeWhispererConstants.javascript : languageId
        if (!languageId) {
            return 'plaintext'
        }

        return languageId
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
