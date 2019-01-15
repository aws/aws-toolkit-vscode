/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { EnvNamespace } from '../../../shared/vscode'

export class MockEnvNamespace implements EnvNamespace {
    public appName: string = 'Visual-Studio-Code'

    public appRoot: string = 'myAppRoot'

    public language: string = 'myLanguage'

    public machineId: string = 'myMachineId'

    public sessionId: string = 'mySessionId'
}
