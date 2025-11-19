/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType } from 'vscode-languageserver-protocol'
import { DeploymentConfig } from './cfnProjectTypes'

export type DocumentInfo = {
    type: 'JSON' | 'YAML'
    content: string
    fileName: string
}

export type ParsedCfnEnvironmentFile = {
    deploymentConfig: DeploymentConfig
    fileName: string
}

export type ParseCfnEnvironmentFilesParams = {
    documents: DocumentInfo[]
}

export type ParseCfnEnvironmentFilesResult = {
    parsedFiles: ParsedCfnEnvironmentFile[]
}

export const ParseCfnEnvironmentFilesRequest = new RequestType<
    ParseCfnEnvironmentFilesParams,
    ParseCfnEnvironmentFilesResult,
    void
>('aws/cfn/environment/files/parse')
