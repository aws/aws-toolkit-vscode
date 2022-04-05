/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { SemVer, parse as semverParse } from 'semver'
import * as vscode from 'vscode'
import { workspace } from 'vscode'
import { getLogger } from '../../../shared/logger'
import { ConsolasLanguage, ConsolasRuntime } from '../../../shared/telemetry/telemetry.gen'
import { ChildProcess } from '../../../shared/utilities/childProcess'
import { ConsolasConstants } from '../models/constants'

interface RuntimeLanguageContext {
    /**
     * collection of all language runtime versions
     */
    languageContexts: {
        [language in ConsolasLanguage as string]: {
            /**
             * the language of the current file
             */
            language: ConsolasLanguage
            /**
             * the language runtime of the current file
             */
            runtimeLanguage: ConsolasRuntime

            /**
             * the original source of the language runtime version of the current file
             */
            runtimeLanguageSource: string
        }
    }
}

export const runtimeLanguageContext: RuntimeLanguageContext = {
    languageContexts: {
        ['plaintext']: {
            language: 'plaintext',
            runtimeLanguage: 'unknown',
            runtimeLanguageSource: '',
        },
    },
}

export class LanguageContext {
    public getRuntimeLanguage(language: string, version: string): ConsolasRuntime {
        const versionNumber = version ? version.split('.')[0].match(/\d+/)![0] : ''
        switch (language) {
            case ConsolasConstants.PYTHON:
                switch (versionNumber) {
                    case '3':
                        return 'python3'
                    default:
                        return 'python2'
                }
            case ConsolasConstants.JAVA:
                switch (versionNumber) {
                    case '8':
                        return 'java8'
                    case '11':
                        return 'java11'
                    default:
                        return 'java16'
                }
            case ConsolasConstants.JAVASCRIPT:
                return 'javascript'
            default:
                return 'unknown'
        }
    }
    public async getLanguageVersionNumber(cmd: string, args: [string]): Promise<SemVer | undefined> {
        try {
            const { stdout, stderr } = await new ChildProcess(cmd, args).run()
            const version = stdout || stderr
            const match = version.trim().match(/[0-9]+.[0-9]+.[0-9]+/g)
            return semverParse(match![0]) as SemVer
        } catch (err) {
            getLogger().error('Failed to get Langauge Runtime Version: %d\n%s', err)
            return
        }
    }

    public async initLanguageContext(languageId: string, config?: vscode.WorkspaceConfiguration) {
        let runtimeVersion: any
        let version = ''
        const languageName = this.convertLanguage(languageId)
        if (languageName in runtimeLanguageContext.languageContexts) return
        if (languageId === ConsolasConstants.PYTHON) {
            const configValue = workspace
                .getConfiguration(ConsolasConstants.PYTHON)
                .get<string>('defaultInterpreterPath')
            const pythonPath = configValue ? configValue.split('/') : []
            const pythonVersion = pythonPath.length > 0 ? pythonPath[pythonPath.length - 1].match(/\d/) : undefined
            if (pythonVersion != undefined && pythonVersion.length > 0) {
                runtimeVersion = pythonVersion ? pythonVersion[0]?.concat('.0.0') : 'unknown'
            } else {
                runtimeVersion = await this.getLanguageVersionNumber('python', ['--version'])
                runtimeVersion = runtimeVersion ? runtimeVersion?.version : 'unknown'
            }
            version = runtimeVersion
        } else if (languageId === ConsolasConstants.JAVA) {
            runtimeVersion = await this.getLanguageVersionNumber('java', ['--version'])
            version = runtimeVersion ? runtimeVersion?.version : 'unknown'
        } else if (languageId === ConsolasConstants.JAVASCRIPT) {
            runtimeVersion = await this.getLanguageVersionNumber('node', ['--version'])
            version = runtimeVersion ? runtimeVersion?.version : 'unknown'
        }

        runtimeLanguageContext.languageContexts[languageName] = {
            language: languageName as ConsolasLanguage,
            runtimeLanguage: this.getRuntimeLanguage(languageId, version),
            runtimeLanguageSource: version,
        }
    }
    public async initLanguageRuntimeContexts() {
        await Promise.all([
            this.initLanguageContext(ConsolasConstants.PYTHON),
            this.initLanguageContext(ConsolasConstants.JAVA),
            this.initLanguageContext(ConsolasConstants.JAVASCRIPT),
        ])
    }

    public getlanguageContextInfo(languageId?: string) {
        const languageName = this.convertLanguage(languageId)
        if (languageName in runtimeLanguageContext.languageContexts) {
            return runtimeLanguageContext.languageContexts[languageName]
        }
        return {
            language: languageName as ConsolasLanguage,
            runtimeLanguage: 'unknown' as ConsolasRuntime,
            runtimeLanguageSource: 'unknown',
        }
    }
    public convertLanguage(languageId?: string) {
        /**
         * Notice: convert typescript language id to "javascript"
         */
        languageId = languageId === ConsolasConstants.TYPESCRIPT ? ConsolasConstants.JAVASCRIPT : languageId
        if (!languageId || !ConsolasConstants.SUPPORTED_LANGUAGES.includes(languageId)) {
            return 'plaintext'
        }

        return languageId
    }
}
