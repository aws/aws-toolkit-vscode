/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { IAM } from 'aws-sdk'

export interface IamClient {
    listRoles(): Promise<IAM.ListRolesResponse>
}
