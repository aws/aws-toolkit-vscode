/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType, CodeAction, Position } from 'vscode-languageserver-protocol'

export type TemplateUri = string

export type GetRelatedResourceTypesParams = {
    parentResourceType: string
}

export type AuthoredResource = {
    logicalId: string
    type: string
}

export type InsertRelatedResourcesParams = {
    templateUri: string
    relatedResourceTypes: string[]
    parentResourceType: string
    parentLogicalId?: string
}

export interface RelatedResourcesCodeAction extends CodeAction {
    data?: {
        scrollToPosition?: Position
        firstLogicalId?: string
    }
}

export const GetAuthoredResourceTypesRequest = new RequestType<TemplateUri, string[], void>(
    'aws/cfn/template/resources/authored'
)

export const GetAuthoredResourceTypesRequestV2 = new RequestType<TemplateUri, AuthoredResource[], void>(
    'aws/cfn/template/resources/authored/v2'
)

export const GetRelatedResourceTypesRequest = new RequestType<GetRelatedResourceTypesParams, string[], void>(
    'aws/cfn/template/resources/related'
)

export const InsertRelatedResourcesRequest = new RequestType<
    InsertRelatedResourcesParams,
    RelatedResourcesCodeAction,
    void
>('aws/cfn/template/resources/insert')
