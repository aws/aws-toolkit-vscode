/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ErrorOrString } from '../../shared/logger'
import { ChannelLogger } from '../../shared/utilities/vsCodeUtils'
import { MockOutputChannel } from '../mockOutputChannel'
import { FakeBasicLogger } from './fakeBasicLogger'

export class FakeChannelLogger implements ChannelLogger {
    public readonly loggedInfoKeys: Set<string> = new Set<string>()
    public readonly loggedErrorKeys: Set<string> = new Set<string>()
    public readonly loggedDebugKeys: Set<string> = new Set<string>()
    public readonly loggedWarnKeys: Set<string> = new Set<string>()
    public readonly loggedVerboseKeys: Set<string> = new Set<string>()
    public readonly logger: FakeBasicLogger = new FakeBasicLogger()

    public channel: vscode.OutputChannel = new MockOutputChannel()

    public info(nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): void {
        this.loggedInfoKeys.add(nlsKey)
    }

    public error(nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): void {
        this.loggedErrorKeys.add(nlsKey)
    }

    public debug(nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): void {
        this.loggedDebugKeys.add(nlsKey)
    }

    public warn(nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): void {
        this.loggedWarnKeys.add(nlsKey)
    }

    public verbose(nlsKey: string, nlsTemplate: string, ...templateTokens: ErrorOrString[]): void {
        this.loggedVerboseKeys.add(nlsKey)
    }
}
