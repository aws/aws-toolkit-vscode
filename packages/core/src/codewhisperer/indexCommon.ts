/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This module is a subset of `./index.js` except it is for 'common' code only.
 *
 * See "Shared vs Common" in our docs/ folder for the meaning of 'common'
 */

export { activate, shutdown } from './activation'
export * from './util/authUtil'
export * from './models/constants'
