/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebviewClientFactory } from '../../../../webviews/client'
import { NotebookJobWebview } from '../../backend/notebookJobWebview'

export const client = WebviewClientFactory.create<NotebookJobWebview>()
