/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Parameter, Tag } from '@aws-sdk/client-cloudformation'

export function convertRecordToParameters(parameters: Record<string, string>): Parameter[] {
    return Object.entries(parameters).map(([key, value]) => ({
        ParameterKey: key,
        ParameterValue: value,
    }))
}

export function convertRecordToTags(tags: Record<string, string>): Tag[] {
    return Object.entries(tags).map(([key, value]) => ({
        Key: key,
        Value: value,
    }))
}

export function convertParametersToRecord(parameters: Parameter[]): Record<string, string> {
    return Object.fromEntries(
        parameters
            .filter((param) => param.ParameterKey && param.ParameterValue)
            .map((param) => [param.ParameterKey!, param.ParameterValue!])
    )
}

export function convertTagsToRecord(tags: Tag[]): Record<string, string> {
    return Object.fromEntries(tags.filter((tag) => tag.Key && tag.Value).map((tag) => [tag.Key!, tag.Value!]))
}
