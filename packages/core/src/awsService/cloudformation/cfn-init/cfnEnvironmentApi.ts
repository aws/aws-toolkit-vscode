/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient/node'
import {
    ParsedCfnEnvironmentFile,
    ParseCfnEnvironmentFilesParams,
    ParseCfnEnvironmentFilesRequest,
} from './cfnEnvironmentRequestType'

export async function parseCfnEnvironmentFiles(
    client: LanguageClient,
    params: ParseCfnEnvironmentFilesParams
): Promise<ParsedCfnEnvironmentFile[]> {
    const result = await client.sendRequest(ParseCfnEnvironmentFilesRequest, params)
    return result.parsedFiles
}
