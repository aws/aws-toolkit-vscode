/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnStackFailure, Parameter } from '@aws-sdk/client-cloudformation'
import { ChangeSetOptionalFlags } from '../stacks/actions/stackActionRequestType'

export type CfnEnvironmentConfig = {
    name: string
    profile: string
}

export type CfnEnvironmentLookup = Record<string, CfnEnvironmentConfig>

export type CfnConfig = {
    version: string
    project: {
        name: string
        created: string
    }
    environments: CfnEnvironmentLookup
}

export type DeploymentConfig = {
    templateFilePath?: string
    parameters?: Record<string, string>
    tags?: Record<string, string>
    includeNestedStacks?: boolean
    importExistingResources?: boolean
    onStackFailure?: OnStackFailure
}

export type CfnEnvironmentFileSelectorItem = {
    fileName: string
    hasMatchingTemplatePath?: boolean
    compatibleParameters?: Parameter[]
    optionalFlags?: ChangeSetOptionalFlags
}
