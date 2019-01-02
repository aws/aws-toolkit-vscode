/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const symbol: {
    asyncIterator: symbol
} = Symbol
symbol.asyncIterator = Symbol.asyncIterator || Symbol.for('Symbol.asyncIterator')
