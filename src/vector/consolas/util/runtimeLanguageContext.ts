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

export class RuntimeLanguageContext {
    private runtimeLanguageContext: RuntimeLanguageContextData = {
        languageContexts: {
            ['plaintext']: {
                language: 'plaintext',
                runtimeLanguage: 'unknown',
                runtimeLanguageSource: '',
            },
        },
    }

    public getRuntimeLanguage(language: string, version: string): ConsolasRuntime {
        const versionNumber = version.split('.')[0]?.match(/\d+/)?.[0] ?? ''
        switch (language) {
            case ConsolasConstants.python:
                switch (versionNumber) {
                    case '3':
                        return 'python3'
                    default:
                        return 'python2'
                }
            case ConsolasConstants.java:
                switch (versionNumber) {
                    case '8':
                        return 'java8'
                    case '11':
                        return 'java11'
                    default:
                        return 'java16'
                }
            case ConsolasConstants.javascript:
                return 'javascript'
            default:
                return 'unknown'
        }
    }

    public async getLanguageVersionNumber(cmd: string, args: [string]): Promise<SemVer | undefined> {
        const { stdout, stderr, exitCode } = await new ChildProcess(cmd, args).run()
        if (exitCode !== 0) {
            getLogger().verbose('getLanguageVersionNumber: failed to get Langauge Runtime Version: %s', stderr)
            return
        }
        const version = stdout || stderr
        const match = version.trim().match(/[0-9]+.[0-9]+.[0-9]+/g)
        if (match?.[0] === undefined) {
            return
        }
        const parsed = semverParse(match[0])
        if (!parsed) {
            return
        }
        return parsed
    }

    public async initLanguageContext(languageId: string, config?: vscode.WorkspaceConfiguration) {
        let runtimeVersion: any
        let version = ''
        const languageName = this.convertLanguage(languageId)
        const cmdArg = process.platform === 'win32' ? '-version' : '--version'
        if (languageName in this.runtimeLanguageContext.languageContexts) return
        if (languageId === ConsolasConstants.python) {
            const configValue = config?.get<string>('defaultInterpreterPath')
            const pythonPath = configValue ? configValue.split('/') : []
            const pythonVersion = pythonPath.length > 0 ? pythonPath[pythonPath.length - 1].match(/\d/) : undefined
            if (pythonVersion != undefined && pythonVersion.length > 0) {
                runtimeVersion = pythonVersion ? pythonVersion[0]?.concat('.0.0') : 'unknown'
            } else {
                runtimeVersion = await this.getLanguageVersionNumber('python', ['--version'])
                runtimeVersion = runtimeVersion ? runtimeVersion?.version : 'unknown'
            }
            version = runtimeVersion
        } else if (languageId === ConsolasConstants.java) {
            runtimeVersion = await this.getLanguageVersionNumber('java', [cmdArg])
            version = runtimeVersion ? runtimeVersion?.version : 'unknown'
        } else if (languageId === ConsolasConstants.javascript) {
            runtimeVersion = await this.getLanguageVersionNumber('node', ['--version'])
            version = runtimeVersion ? runtimeVersion?.version : 'unknown'
        }

        this.runtimeLanguageContext.languageContexts[languageName] = {
            language: languageName as ConsolasLanguage,
            runtimeLanguage: this.getRuntimeLanguage(languageId, version),
            runtimeLanguageSource: version,
        }
    }

    public setRuntimeLanguageContext(languageName: string, runtimeLanguage: string, version: string) {
        this.runtimeLanguageContext.languageContexts[languageName] = {
            language: languageName as ConsolasLanguage,
            runtimeLanguage: runtimeLanguage as ConsolasRuntime,
            runtimeLanguageSource: version,
        }
    }

    public async initLanguageRuntimeContexts() {
        await Promise.all([
            this.initLanguageContext(ConsolasConstants.python, workspace.getConfiguration(ConsolasConstants.python)),
            this.initLanguageContext(ConsolasConstants.java),
            this.initLanguageContext(ConsolasConstants.javascript),
        ])
    }

    public getLanguageContext(languageId?: string) {
        const languageName = this.convertLanguage(languageId)
        if (languageName in this.runtimeLanguageContext.languageContexts) {
            return this.runtimeLanguageContext.languageContexts[languageName]
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
        languageId = languageId === ConsolasConstants.typescript ? ConsolasConstants.javascript : languageId
        if (!languageId) {
            return 'plaintext'
        }

        return languageId
    }
}

export const runtimeLanguageContext = new RuntimeLanguageContext()
