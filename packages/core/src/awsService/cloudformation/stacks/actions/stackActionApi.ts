/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient/node'
import {
    TemplateUri,
    GetParametersResult,
    GetCapabilitiesResult,
    CreateStackActionResult,
    GetStackActionStatusResult,
    TemplateResource,
    CreateValidationParams,
    CreateDeploymentParams,
    DescribeValidationStatusResult,
    DescribeDeploymentStatusResult,
    DeleteChangeSetParams,
    DescribeDeletionStatusResult,
    DescribeChangeSetParams,
    DescribeChangeSetResult,
    GetTemplateArtifactsResult,
} from './stackActionRequestType'
import {
    GetParametersRequest,
    GetCapabilitiesRequest,
    CreateValidationRequest,
    CreateDeploymentRequest,
    GetValidationStatusRequest,
    GetDeploymentStatusRequest,
    GetTemplateResourcesRequest,
    GetTemplateArtifactsRequest,
    DescribeValidationStatusRequest,
    DescribeDeploymentStatusRequest,
    DeleteChangeSetRequest,
    GetChangeSetDeletionStatusRequest,
    DescribeChangeSetDeletionStatusRequest,
    DescribeChangeSetRequest,
} from './stackActionProtocol'
import { Identifiable } from '../../lspTypes'

export async function validate(
    client: LanguageClient,
    params: CreateValidationParams
): Promise<CreateStackActionResult> {
    return await client.sendRequest(CreateValidationRequest, params)
}

export async function deploy(client: LanguageClient, params: CreateDeploymentParams): Promise<CreateStackActionResult> {
    return await client.sendRequest(CreateDeploymentRequest, params)
}

export async function deleteChangeSet(
    client: LanguageClient,
    params: DeleteChangeSetParams
): Promise<CreateStackActionResult> {
    return await client.sendRequest(DeleteChangeSetRequest, params)
}

export async function getValidationStatus(
    client: LanguageClient,
    params: Identifiable
): Promise<GetStackActionStatusResult> {
    return await client.sendRequest(GetValidationStatusRequest, params)
}

export async function getDeploymentStatus(
    client: LanguageClient,
    params: Identifiable
): Promise<GetStackActionStatusResult> {
    return await client.sendRequest(GetDeploymentStatusRequest, params)
}

export async function describeValidationStatus(
    client: LanguageClient,
    params: Identifiable
): Promise<DescribeValidationStatusResult> {
    return await client.sendRequest(DescribeValidationStatusRequest, params)
}

export async function describeDeploymentStatus(
    client: LanguageClient,
    params: Identifiable
): Promise<DescribeDeploymentStatusResult> {
    return await client.sendRequest(DescribeDeploymentStatusRequest, params)
}

export async function getChangeSetDeletionStatus(
    client: LanguageClient,
    params: Identifiable
): Promise<GetStackActionStatusResult> {
    return await client.sendRequest(GetChangeSetDeletionStatusRequest, params)
}

export async function describeChangeSetDeletionStatus(
    client: LanguageClient,
    params: Identifiable
): Promise<DescribeDeletionStatusResult> {
    return await client.sendRequest(DescribeChangeSetDeletionStatusRequest, params)
}

export async function getParameters(client: LanguageClient, params: TemplateUri): Promise<GetParametersResult> {
    return await client.sendRequest(GetParametersRequest, params)
}

export async function getCapabilities(client: LanguageClient, params: TemplateUri): Promise<GetCapabilitiesResult> {
    return await client.sendRequest(GetCapabilitiesRequest, params)
}

export async function getTemplateResources(client: LanguageClient, params: TemplateUri): Promise<TemplateResource[]> {
    const result = await client.sendRequest(GetTemplateResourcesRequest, params)
    return result.resources
}

export async function getTemplateArtifacts(
    client: LanguageClient,
    params: TemplateUri
): Promise<GetTemplateArtifactsResult> {
    return await client.sendRequest(GetTemplateArtifactsRequest, params)
}

export async function describeChangeSet(
    client: LanguageClient,
    params: DescribeChangeSetParams
): Promise<DescribeChangeSetResult> {
    return await client.sendRequest(DescribeChangeSetRequest, params)
}
