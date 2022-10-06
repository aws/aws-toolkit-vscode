/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { I18nResolver } from 'i18n-ts'
import en from './en'

export class I18n {
    public texts
    constructor(localLanguage: string) {
        const i18n = {
            en,
            default: en,
        }

        this.texts = new I18nResolver(i18n, localLanguage).translation
    }
}
