/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as os from 'os'

const homeDir = os.homedir()

export const agentsFile = path.join(homeDir, 'AGENTS.md')
export const contextFile = path.join(homeDir, 'smus-context.md')

// Text for agent context
export const importStatement =
    '## Importing file for SageMaker Unified Studio context\n\n@smus-context.md [SageMaker Unified Studio Context](smus-context.md)'
export const notificationMessage = 'Added SageMaker Unified Studio context.'
export const promptMessage =
    'Would you like to add SageMaker Unified Studio context to your AGENTS.md file? This will help AI agents get context about your SageMaker Unified Studio space.'
