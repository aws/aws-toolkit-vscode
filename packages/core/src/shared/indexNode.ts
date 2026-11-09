/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Contains exports that only work for node, NOT web.
 * Attempting to import from this file in web will throw an error,
 * likely `TypeError: Cannot read properties of undefined (reading 'native')`
 */

export * as filetypes from './filetypes'
export { SchemaService } from './schemas'
