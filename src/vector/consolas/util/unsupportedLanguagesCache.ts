/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConsolasConstants } from '../models/constants'
import globals from '../../../shared/extensionGlobals'

export class UnsupportedLanguagesCache {
    static TTL: number = ConsolasConstants.CONSOLAS_UNSUPPORTED_LANGUAGES_CACHE_TTL
    static key = ConsolasConstants.CONSOLAS_UNSUPPORTED_LANGUAGES_KEY

    private static get(key: string): any {
        return globals.context.globalState.get(key)
    }

    private static set(key: string, value: any) {
        return globals.context.globalState.update(key, value)
    }

    static clear() {
        this.set(this.key, {})
    }

    static getCache(): { [key: string]: number } {
        const store = this.get(this.key)
        if (store === undefined) {
            this.clear()
            return this.get(this.key)
        }
        return store
    }

    static isUnsupportedProgrammingLanguage(programmingLanguage: string): boolean {
        const store = this.getCache()
        if (programmingLanguage in store) {
            if (Date.now() - store[programmingLanguage] > this.TTL) {
                delete store[programmingLanguage]
                this.set(this.key, store)
                return false
            }
            return true
        }
        return false
    }

    static addUnsupportedProgrammingLanguage(programmingLanguage: string) {
        const store = this.getCache()
        store[programmingLanguage] = Date.now()
        this.set(this.key, store)
    }
}
