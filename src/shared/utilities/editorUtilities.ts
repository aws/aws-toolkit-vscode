/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as _path from 'path'
import { DefaultSettingsConfiguration } from '../settingsConfiguration'

const DEFAULT_TAB_SIZE = 4

export function getTabSizeSetting(): number {
    return new DefaultSettingsConfiguration('editor').readSetting<number>('tabSize') || DEFAULT_TAB_SIZE
}
