/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { runSamCliListResource } from '../../shared/sam/cli/samCliListResources'

export interface StackResource {
    LogicalResourceId: string
    PhysicalResourceId: string
}

/*
This function return exclusively the deployed resources
Newly added but yet-to-be deployed resources are not included in this result
*/
export async function getDeployedResources(params: any) {
    try {
        const samCliListResourceOutput = await runSamCliListResource(params.listResourcesParams, params.invoker).then(
            (output) => parseSamListResourceOutput(output)
        )
        // Filter out resources that are not deployed
        return samCliListResourceOutput.filter((resource) => resource.PhysicalResourceId !== '-')
    } catch (err) {
        const error = err as Error
        getLogger().error(error)
    }
}

function parseSamListResourceOutput(output: any): StackResource[] {
    try {
        if ((Array.isArray(output) && output.length === 0) || '[]' === output) {
            // Handle if the output is instance or stringify version of an empty array to avoid parsing error
            return []
        }
        return JSON.parse(output) as StackResource[]
    } catch (error: any) {
        void vscode.window.showErrorMessage(`Failed to parse SAM CLI output: ${error.message}`)
        return []
    }
}
