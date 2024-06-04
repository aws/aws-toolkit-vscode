/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export { activate, shutdown } from './activation'
export { AuthUtil, AuthState, isValidAmazonQConnection } from './util/authUtil'
export { CodeSuggestionsState, transformByQState, ZipManifest, ConfigurationEntry } from './models/model'
export * from './models/constants'
export { codeWhispererClient, DefaultCodeWhispererClient } from './client/codewhisperer'
export { getSha256, uploadArtifactToS3, zipCode } from './service/transformByQ/transformApiHandler'
export { RecommendationHandler } from './service/recommendationHandler'
export { KeyStrokeHandler } from './service/keyStrokeHandler'
export {
    getPresignedUrlAndUpload,
    createScanJob,
    pollScanJobStatus,
    listScanResults,
} from './service/securityScanHandler'
export { session } from './util/codeWhispererSession'
export { invokeRecommendation } from './commands/invokeRecommendation'
export { ZipUtil } from './util/zipUtil'
