/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Sourced from https://github.com/microsoft/vscode/blob/238c19cc7727511d495d67d2ce1e0ec0638de2ce/src/vscode-dts/vscode.d.ts
// This API was added in 1.53. Not supported in Cloud9.
declare module 'vscode' {
    export interface ExtensionContext {
        /**
         * A storage utility for secrets. Secrets are persisted across reloads and are independent of the
         * current opened {@link workspace.workspaceFolders workspace}.
         */
        readonly secrets: SecretStorage
    }

    /**
     * The event data that is fired when a secret is added or removed.
     */
    export interface SecretStorageChangeEvent {
        /**
         * The key of the secret that has changed.
         */
        readonly key: string
    }

    /**
     * Represents a storage utility for secrets, information that is
     * sensitive.
     */
    export interface SecretStorage {
        /**
         * Retrieve a secret that was stored with key. Returns undefined if there
         * is no password matching that key.
         * @param key The key the secret was stored under.
         * @returns The stored value or `undefined`.
         */
        get(key: string): Thenable<string | undefined>

        /**
         * Store a secret under a given key.
         * @param key The key to store the secret under.
         * @param value The secret.
         */
        store(key: string, value: string): Thenable<void>

        /**
         * Remove a secret from storage.
         * @param key The key the secret was stored under.
         */
        delete(key: string): Thenable<void>

        /**
         * Fires when a secret is stored or deleted.
         */
        onDidChange: Event<SecretStorageChangeEvent>
    }
}
