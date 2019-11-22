/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Unit } from './clienttelemetry'

export interface TelemetryName {
    namespace: TelemetryNamespace | OldTelemetryNamespace
    name: string
}

export interface Datum {
    name: string
    value: number
    unit?: Unit
    metadata?: Map<string, string>
}

type OldTelemetryNamespace = 'Command'
export const ACCOUNT_METADATA_KEY = 'awsAccount'

export enum TelemetryNamespace {
    Aws = 'aws',
    Cdk = 'cdk',
    Cloudformation = 'cloudformation',
    Lambda = 'lambda',
    Project = 'project',
    Session = 'session'
}

export enum AccountStatus {
    NotApplicable = 'n/a',
    NotSet = 'not-set',
    Invalid = 'invalid'
}

export const METADATA_FIELD_NAME = {
    RESULT: 'result',
    DURATION: 'duration',
    REASON: 'reason'
}

export enum MetadataResult {
    Pass = 'Succeeded',
    Fail = 'Failed',
    Cancel = 'Cancelled'
}
