/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ConsolasLanguage } from '../../../shared/telemetry/telemetry.gen'
import { ConsolasConstants } from '../models/constants'

interface RuntimeLanguageContextData {
    /**
     * collection of all language runtime versions
     */
    languageContexts: {
        [language in ConsolasLanguage as string]: {
            /**
             * the language of the current file
             */
            language: ConsolasLanguage
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
            language: languageName as ConsolasLanguage,
        }
    }

    public convertLanguage(languageId?: string) {
        /**
         * Notice: convert typescript language id to "javascript"
         */
        languageId = languageId === ConsolasConstants.typescript ? ConsolasConstants.javascript : languageId
        if (!languageId) {
            return 'plaintext'
        }

        return languageId
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
