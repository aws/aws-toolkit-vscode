/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Clipboard, Env } from '../../../shared/vscode/env'

export interface FakeEnvOptions {
    clipboard?: FakeClipboard | FakeClipboardOptions
}

export class FakeEnv implements Env {
    private readonly _clipboard: FakeClipboard

    public get clipboard(): FakeClipboard {
        return this._clipboard
    }

    public constructor({ clipboard = new FakeClipboard() }: FakeEnvOptions = {}) {
        this._clipboard = clipboard instanceof FakeClipboard ? clipboard : new FakeClipboard(clipboard)
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FakeClipboardOptions {}

export class FakeClipboard implements Clipboard {
    private _text: string | undefined

    /**
     * The text that was written, if any.
     */
    public get text(): string | undefined {
        return this._text
    }

    /**
     * Records the text that was written.
     *
     * @returns an empty Promise.
     */
    public async writeText(text: string): Promise<void> {
        this._text = text
    }

    public constructor({}: FakeClipboardOptions = {}) {}
}
