/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0 fort
 */

import { getNotificationsSuite } from 'aws-core-vscode/test'
import { getAuthState } from '../../../src/extensionNode'

getNotificationsSuite(getAuthState)
