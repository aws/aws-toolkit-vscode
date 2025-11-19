/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType } from 'vscode-languageserver-protocol'
import { Identifiable } from '../../lspTypes'
import {
    TemplateUri,
    GetParametersResult,
    CreateStackActionResult,
    GetStackActionStatusResult,
    GetCapabilitiesResult,
    GetTemplateResourcesResult,
    GetTemplateArtifactsResult,
    ListChangeSetsParams,
    ListChangeSetsResult,
    CreateValidationParams,
    CreateDeploymentParams,
    DescribeValidationStatusResult,
    DescribeDeploymentStatusResult,
    DeleteChangeSetParams,
    DescribeDeletionStatusResult,
    GetStackEventsParams,
    GetStackEventsResult,
    ClearStackEventsParams,
    DescribeChangeSetParams,
    DescribeChangeSetResult,
    GetStackResourcesParams,
    ListStackResourcesResult,
    DescribeStackParams,
    DescribeStackResult,
} from './stackActionRequestType'

export const CreateValidationRequest = new RequestType<CreateValidationParams, CreateStackActionResult, void>(
    'aws/cfn/stack/validation/create'
)

export const CreateDeploymentRequest = new RequestType<CreateDeploymentParams, CreateStackActionResult, void>(
    'aws/cfn/stack/deployment/create'
)

export const GetValidationStatusRequest = new RequestType<Identifiable, GetStackActionStatusResult, void>(
    'aws/cfn/stack/validation/status'
)

export const GetDeploymentStatusRequest = new RequestType<Identifiable, GetStackActionStatusResult, void>(
    'aws/cfn/stack/deployment/status'
)

export const DescribeValidationStatusRequest = new RequestType<Identifiable, DescribeValidationStatusResult, void>(
    'aws/cfn/stack/validation/status/describe'
)

export const DescribeDeploymentStatusRequest = new RequestType<Identifiable, DescribeDeploymentStatusResult, void>(
    'aws/cfn/stack/deployment/status/describe'
)

export const DeleteChangeSetRequest = new RequestType<DeleteChangeSetParams, CreateStackActionResult, void>(
    'aws/cfn/stack/changeSet/delete'
)

export const GetChangeSetDeletionStatusRequest = new RequestType<Identifiable, GetStackActionStatusResult, void>(
    'aws/cfn/stack/changeSet/deletion/status'
)

export const DescribeChangeSetDeletionStatusRequest = new RequestType<Identifiable, DescribeDeletionStatusResult, void>(
    'aws/cfn/stack/changeSet/deletion/status/describe'
)

export const GetParametersRequest = new RequestType<TemplateUri, GetParametersResult, void>('aws/cfn/stack/parameters')

export const GetCapabilitiesRequest = new RequestType<TemplateUri, GetCapabilitiesResult, void>(
    'aws/cfn/stack/capabilities'
)

export const GetTemplateResourcesRequest = new RequestType<TemplateUri, GetTemplateResourcesResult, void>(
    'aws/cfn/stack/import/resources'
)

export const GetTemplateArtifactsRequest = new RequestType<TemplateUri, GetTemplateArtifactsResult, void>(
    'aws/cfn/stack/template/artifacts'
)

export const ListChangeSetsRequest = new RequestType<ListChangeSetsParams, ListChangeSetsResult, void>(
    'aws/cfn/stack/changeSet/list'
)

export const GetStackEventsRequest = new RequestType<GetStackEventsParams, GetStackEventsResult, void>(
    'aws/cfn/stack/events'
)

export const ClearStackEventsRequest = new RequestType<ClearStackEventsParams, void, void>('aws/cfn/stack/events/clear')

export const DescribeStackRequest = new RequestType<DescribeStackParams, DescribeStackResult, void>(
    'aws/cfn/stack/describe'
)

export const DescribeChangeSetRequest = new RequestType<DescribeChangeSetParams, DescribeChangeSetResult, void>(
    'aws/cfn/stack/changeSet/describe'
)

export const GetStackResourcesRequest = new RequestType<GetStackResourcesParams, ListStackResourcesResult, void>(
    'aws/cfn/stack/resources'
)
