/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { runSamCliListResource } from '../../shared/sam/cli/samCliListResources'
export interface StackResource {
    LogicalResourceId: string
    PhysicalResourceId: string
}

export async function getDeployedResources(params: any) {
    try {
        return await runSamCliListResource(params.listResourcesParams, params.invoker).then((output) =>
            parseSamListResourceOutput(output)
        )
    } catch (err) {
        const error = err as Error
        getLogger().error(error)
    }
}

function parseSamListResourceOutput(output: any): StackResource[] {
    try {
        if (Array.isArray(output) && Array.from(output).length === 0) {
            // Handle empty array avoid parsing error
            return []
        }
        return JSON.parse(output) as StackResource[]
    } catch (error: any) {
        void vscode.window.showErrorMessage(`Failed to parse SAM CLI output: ${error.message}`)
        return []
    }
}
