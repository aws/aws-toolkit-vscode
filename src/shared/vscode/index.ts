/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { CommandsNamespace } from './commandsNamespace'
import { VSCodeContext } from './context'
import { DebugNamespace } from './debugNamespace'
import { EnvNamespace } from './envNamespace'
import { LanguagesNamespace } from './languagesNamespace'
import { TasksNamespace } from './tasksNamespace'
import * as types from './types'
import { WindowNamespace } from './windowNamespace'
import { WorkspaceNamespace } from './workspaceNamespace'

export {
    types,
    CommandsNamespace,
    DebugNamespace,
    EnvNamespace,
    LanguagesNamespace,
    TasksNamespace,
    VSCodeContext,
    WindowNamespace,
    WorkspaceNamespace,
}
