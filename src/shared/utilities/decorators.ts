/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, logLevels } from '../logger/logger'

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
            const clone = Object.create(v)

            for (const key of logLevels.keys()) {
                Object.defineProperty(clone, key, {
                    value: function (message: string | Error, ...meta: any[]) {
                        Object.getPrototypeOf(v)[key].call(v, message, ...meta, { name })
                    },
                })
            }

            _logger = clone
        },
    })
}
