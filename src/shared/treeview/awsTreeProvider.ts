/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

interface AwsTreeProvider {
    viewProviderId: string
}

export interface RefreshableAwsTreeProvider extends AwsTreeProvider {
    refresh(): void
}
