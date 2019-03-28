/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

if (!Symbol.asyncIterator) {
    Object.defineProperty(
        Symbol,
        'asyncIterator',
        {
            value: Symbol.for('Symbol.asyncIterator')
        }
    )
}
