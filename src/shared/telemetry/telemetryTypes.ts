/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const ACCOUNT_METADATA_KEY = 'awsAccount'
export const COMPUTE_REGION_KEY = 'computeRegion'

export enum AccountStatus {
    NotApplicable = 'n/a',
    NotSet = 'not-set',
    Invalid = 'invalid',
}

export const METADATA_FIELD_NAME = {
    RESULT: 'result',
    DURATION: 'duration',
    REASON: 'reason',
}

export enum MetadataResult {
    Pass = 'Succeeded',
    Fail = 'Failed',
    Cancel = 'Cancelled',
}
