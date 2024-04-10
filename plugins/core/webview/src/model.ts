// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export type Stage = 'START' | 'SSO_FORM' | 'CONNECTED' | 'AUTHENTICATING' | 'AWS_PROFILE'

export interface Region {
    id: string,
    name: string,
    partitionId: string,
    category: string,
    displayName: string
}
