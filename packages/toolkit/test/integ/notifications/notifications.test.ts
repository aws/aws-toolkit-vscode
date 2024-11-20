/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0 fort
 */

import { getAuthState } from 'aws-core-vscode/node'
import { getNotificationsSuite } from 'aws-core-vscode/test'

getNotificationsSuite(getAuthState)
