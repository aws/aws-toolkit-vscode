/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../../shared/vscode/commands'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FakeCommandsOptions {}

export class FakeCommands implements Commands {
    private _command: string | undefined
    private _args: any[] | undefined

    /**
     * The command that was executed, in any.
     */
    public get command(): string | undefined {
        return this._command
    }

    /**
     * The arguments to the command that was executed, if any.
     */
    public get args(): any[] | undefined {
        return this._args
    }

    public constructor(_items: FakeCommandsOptions = {}) {}

    /**
     * Records the command that was executed, along with its arguments.
     *
     * @returns an empty Promise.
     */
    public async execute<T>(command: string, ...rest: any[]): Promise<T | undefined> {
        this._command = command
        this._args = rest

        return undefined
    }
}
