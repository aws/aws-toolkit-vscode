/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { NominalType } from '../../shared/utilities/tsUtils'

type PatchOverloadedReturnType<T, R> = T extends {
    (...args: infer P1): infer R1
    (...args: infer P2): infer R2
}
    ? {
          (...args: P1): R1 extends string ? R : never
          (...args: P2): R2 extends string ? R : never
      }
    : never

declare module 'vscode-nls' {
    type LocalizedString = NominalType<string, 'localized'>
    function loadMessageBundle(file?: string): PatchOverloadedReturnType<nls.LocalizeFunc, LocalizedString>
}
