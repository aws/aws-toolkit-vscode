/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

'use strict'

export interface AwsTreeProvider {
    viewProviderId: string

    initialize(): void
}
