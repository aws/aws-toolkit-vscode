/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The auth specific code we are exporting to consumers of `core`.
 *
 * This module is exposed through `exports` in the `package.json` file
 */
export { initialize as initializeAuth } from './activation'
export { initializeAwsCredentialsStatusBarItem } from './ui/statusBarItem'
export { Connection, AwsConnection } from './connection'
export { Auth } from './auth'
export { CredentialsStore } from './credentials/store'
export { LoginManager } from './deprecated/loginManager'
export * as AuthUtils from './utils'
