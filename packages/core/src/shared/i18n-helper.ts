/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import translations from '../../package.nls.json'
import { localize } from './utilities/vsCodeUtils'

export const i18n = (code: string) => {
    const translationsTyped = translations as { [key: string]: string }

    if (translationsTyped[code]) {
        return localize(code, translationsTyped[code])
    } else {
        return code
    }
}
