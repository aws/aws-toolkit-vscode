/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, Clipboard } from '../../../shared/vscode/env'

export interface FakeEnvOptions {
    clipboard?: ClipboardOptions
}

export class FakeEnv implements Env {
    private readonly _clipboard: DefaultFakeClipboard

    public get clipboard(): FakeClipboard {
        return this._clipboard
    }

    public constructor({ clipboard }: FakeEnvOptions = {}) {
        this._clipboard = new DefaultFakeClipboard(clipboard)
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ClipboardOptions {}

export interface FakeClipboard extends Clipboard {
    /**
     * The text that was written, if any.
     */
    readonly text: string | undefined
}

class DefaultFakeClipboard implements FakeClipboard {
    public text: string | undefined

    /**
     * Records the text that was written.
     *
     * @returns an empty Promise.
     */
    public async writeText(text: string): Promise<void> {
        this.text = text
    }

    public constructor(_options: ClipboardOptions = {}) {}
}
