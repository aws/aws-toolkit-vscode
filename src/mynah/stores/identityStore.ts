/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Memento, SecretStorage } from 'vscode'

export class IdentityStore {
    public static readonly IDENTITY_ID_KEY = 'IDENTITY_ID'

    constructor(private readonly storage: SecretStorage, private readonly fallbackStorage: Memento) {}

    public async get(key: string): Promise<string | undefined> {
        const fallback: string | undefined = this.fallbackStorage.get(key)
        if (fallback !== undefined) {
            return fallback
        }
        try {
            return await this.storage.get(key)
        } catch {
            return undefined
        }
    }

    public async store(key: string, value: string): Promise<void> {
        try {
            await this.storage.store(key, value)
        } catch {
            await this.fallbackStorage.update(key, value)
        }
    }
}
