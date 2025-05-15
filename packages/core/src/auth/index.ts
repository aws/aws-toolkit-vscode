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
export {
    Connection,
    AwsConnection,
    SsoConnection,
    isAnySsoConnection,
    isBuilderIdConnection,
    getTelemetryMetadataForConn,
    isIamConnection,
    isSsoConnection,
} from './connection'
export { Auth } from './auth'
export { CredentialsStore } from './credentials/store'
export { LoginManager } from './deprecated/loginManager'
export * as constants from './sso/constants'
export * as cache from './sso/cache'
export * as authUtils from './utils'
export * as auth2 from './auth2'
export * as SsoAccessTokenProvider from './sso/ssoAccessTokenProvider'
