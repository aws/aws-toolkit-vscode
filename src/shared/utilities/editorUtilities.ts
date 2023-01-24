/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _path from 'path'
import { Settings } from '../settings'

const defaultTabSize = 4

export function getTabSizeSetting(): number {
    return Settings.instance.getSection('editor').get('tabSize', defaultTabSize)
}

export function getInlineSuggestEnabled(): boolean {
    return Settings.instance.getSection('editor').get('inlineSuggest.enabled', true)
}
