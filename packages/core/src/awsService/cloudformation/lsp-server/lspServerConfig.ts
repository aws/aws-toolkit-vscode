/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const CfnLspName = 'cloudformation-languageserver'
export const CfnLspServerFile = 'cfn-lsp-server-standalone.js'
export const RequiredFiles = [
    'bin',
    'node_modules',
    'cfn-lsp-server-standalone.js',
    'package.json',
    'pyodide-worker.js',
    'assets',
]

export type CfnLspServerEnvType = 'alpha' | 'beta' | 'prod'
