/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Parameter,
    Capability,
    ResourceChangeDetail,
    ResourceStatus,
    DetailedStatus,
    ResourceTargetDefinition,
    StackEvent,
    OnStackFailure,
    Tag,
    Stack,
} from '@aws-sdk/client-cloudformation'
import { Identifiable } from '../../lspTypes'

export type ResourceToImport = {
    ResourceType: string
    LogicalResourceId: string
    ResourceIdentifier: Record<string, string>
}

export enum DeploymentMode {
    REVERT_DRIFT = 'REVERT_DRIFT',
}

export type ChangeSetOptionalFlags = {
    onStackFailure?: OnStackFailure
    includeNestedStacks?: boolean
    tags?: Tag[]
    importExistingResources?: boolean
    deploymentMode?: DeploymentMode
}

export type CreateValidationParams = Identifiable & {
    uri: string
    stackName: string
    parameters?: Parameter[]
    capabilities?: Capability[]
    resourcesToImport?: ResourceToImport[]
    keepChangeSet?: boolean
    onStackFailure?: OnStackFailure
    includeNestedStacks?: boolean
    tags?: Tag[]
    importExistingResources?: boolean
    deploymentMode?: DeploymentMode
    s3Bucket?: string
    s3Key?: string
}

export type ChangeSetReference = {
    changeSetName: string
    stackName: string
}

export type CreateDeploymentParams = Identifiable & ChangeSetReference

export type DeleteChangeSetParams = Identifiable & ChangeSetReference

export type CreateStackActionResult = Identifiable & ChangeSetReference

export type ValidationResult = {
    level: 'FAIL' | 'WARN' | 'INFO'
    type: string
    validationName: string
    status: 'COMPLETE' | 'FAILED' | 'SKIPPED'
    details: string
    propertyPath?: string
    remediationAction?: string
    detailedStatus?: string
}

export type StackChange = {
    type?: string
    resourceChange?: {
        action?: string
        logicalResourceId?: string
        physicalResourceId?: string
        resourceType?: string
        replacement?: string
        scope?: string[]
        beforeContext?: string
        afterContext?: string
        resourceDriftStatus?: string
        details?: ResourceChangeDetailV2[]
    }
    validationResults?: ValidationResult[]
}

export type ResourceTargetDefinitionV2 = ResourceTargetDefinition & {
    Drift?: {
        PreviousValue: string
        ActualValue?: string
    }
    LiveResourceDrift?: {
        PreviousValue: string
        ActualValue?: string
    }
}

export type ResourceChangeDetailV2 = Omit<ResourceChangeDetail, 'Target'> & {
    Target?: ResourceTargetDefinitionV2
}

export enum StackActionPhase {
    VALIDATION_STARTED = 'VALIDATION_STARTED',
    VALIDATION_IN_PROGRESS = 'VALIDATION_IN_PROGRESS',
    VALIDATION_COMPLETE = 'VALIDATION_COMPLETE',
    VALIDATION_FAILED = 'VALIDATION_FAILED',
    DEPLOYMENT_STARTED = 'DEPLOYMENT_STARTED',
    DEPLOYMENT_IN_PROGRESS = 'DEPLOYMENT_IN_PROGRESS',
    DEPLOYMENT_COMPLETE = 'DEPLOYMENT_COMPLETE',
    DEPLOYMENT_FAILED = 'DEPLOYMENT_FAILED',
    DELETION_STARTED = 'DELETION_STARTED',
    DELETION_IN_PROGRESS = 'DELETION_IN_PROGRESS',
    DELETION_COMPLETE = 'DELETION_COMPLETE',
    DELETION_FAILED = 'DELETION_FAILED',
}

export enum StackActionState {
    IN_PROGRESS = 'IN_PROGRESS',
    SUCCESSFUL = 'SUCCESSFUL',
    FAILED = 'FAILED',
}

export type GetStackActionStatusResult = Identifiable & {
    phase: StackActionPhase
    state: StackActionState
    changes?: StackChange[]
}

export type ValidationDetail = {
    ValidationName: string
    LogicalId?: string
    ResourcePropertyPath?: string
    Severity: 'INFO' | 'ERROR'
    Message: string
}

export type DeploymentEvent = {
    LogicalResourceId?: string
    ResourceType?: string
    ResourceStatus?: ResourceStatus
    ResourceStatusReason?: string
    DetailedStatus?: DetailedStatus
}

export type Failable = {
    FailureReason?: string
}

export type DescribeValidationStatusResult = GetStackActionStatusResult &
    Failable & {
        ValidationDetails?: ValidationDetail[]
    }

export type DescribeDeploymentStatusResult = GetStackActionStatusResult &
    Failable & {
        DeploymentEvents?: DeploymentEvent[]
    }

export type DescribeDeletionStatusResult = GetStackActionStatusResult & Failable

export type GetParametersResult = {
    parameters: TemplateParameter[]
}

export type GetCapabilitiesResult = {
    capabilities: Capability[]
}

export type TemplateResource = {
    logicalId: string
    type: string
    primaryIdentifierKeys?: string[]
    primaryIdentifier?: Record<string, string>
}

export type GetTemplateResourcesResult = {
    resources: TemplateResource[]
}

export type Artifact = {
    resourceType: string
    filePath: string
}

export type GetTemplateArtifactsResult = {
    artifacts: Artifact[]
}

export enum OptionalFlagMode {
    Skip = 'Skip Optional Flags',
    Input = 'Input Optional Flags',
    DevFriendly = 'Use Developer Friendly Flag Selections',
}

export type TemplateParameter = {
    name: string
    Type?: string
    Default?: string | number | boolean
    Description?: string
    AllowedValues?: (string | number | boolean)[]
    AllowedPattern?: string
    MinLength?: number
    MaxLength?: number
    MinValue?: number
    MaxValue?: number
}

export type TemplateUri = string

export type ChangeSetInfo = {
    changeSetName: string
    status: string
    creationTime?: string
    description?: string
}

export type ListChangeSetsParams = {
    stackName: string
    nextToken?: string
}

export type ListChangeSetsResult = {
    changeSets: ChangeSetInfo[]
    nextToken?: string
}

export type DescribeChangeSetParams = ChangeSetReference

export type DescribeChangeSetResult = ChangeSetInfo & {
    stackName: string
    changes?: StackChange[]
}

export type StackInfo = {
    StackName: string
    StackId?: string
    StackStatus?: string
    StackStatusReason?: string
    TemplateDescription?: string
    CreationTime?: string
    LastUpdatedTime?: string
    RootId?: string
    ParentId?: string
    DisableRollback?: boolean
    EnableTerminationProtection?: boolean
    TimeoutInMinutes?: number
}

export type GetStackEventsParams = {
    stackName: string
    nextToken?: string
    refresh?: boolean
}

export type GetStackEventsResult = {
    events: StackEvent[]
    nextToken?: string
    gapDetected?: boolean
}

export type ClearStackEventsParams = {
    stackName: string
}

export type DescribeStackParams = {
    stackName: string
}

export type DescribeStackResult = {
    stack?: Stack
}

export interface StackResourceSummary {
    LogicalResourceId: string
    PhysicalResourceId?: string
    ResourceType: string
    ResourceStatus: string
    Timestamp?: string
}

export type ListStackResourcesResult = {
    resources: StackResourceSummary[]
    nextToken?: string
}

export interface GetStackResourcesParams {
    stackName: string
    nextToken?: string
}
