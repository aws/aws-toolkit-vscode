/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LspVersion, Target, Manifest } from '../../../shared/lsp/types'

/**
 * CloudFormation-specific target extension with optional Node.js version.
 */
export interface CfnTarget extends Target {
    nodejs?: string
}

/**
 * CloudFormation-specific LSP version with typed targets.
 */
export interface CfnLspVersion extends LspVersion {
    targets: CfnTarget[]
}

/**
 * CloudFormation-specific manifest type.
 */
export interface CfnManifest extends Manifest {
    versions: CfnLspVersion[]
}
