/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '../logger/logger'

export function logging<T extends new (...args: any) => { logger: Logger }>(constructor: T) {
    let _logger: Logger | undefined
    const name = constructor.name
    Object.defineProperty(constructor.prototype, 'logger', {
        get: () => {
            if (_logger === undefined) {
                throw new Error(`Class "${name}" accessed logger before assigning it`)
            }
            return _logger
        },
        set: (v: Logger) => {
            v.name = name
            _logger = v
        },
    })
}
