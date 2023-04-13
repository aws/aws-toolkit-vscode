/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Sourced from https://github.com/microsoft/vscode/blob/00e3acf1ee6bdfef8d4d71b899af743cfe0f182c/src/vscode-dts/vscode.d.ts
// This API was added in 1.53. Not supported in Cloud9.
declare module 'vscode' {
    export interface ExtensionContext {
        /**
         * A storage utility for secrets. Secrets are persisted across reloads and are independent of the
         * current opened {@link workspace.workspaceFolders workspace}.
         */
        readonly secrets: SecretStorage

        /**
         * A memento object that stores state independent
         * of the current opened {@link workspace.workspaceFolders workspace}.
         */
        readonly globalState: Memento & {
            /**
             * Set the keys whose values should be synchronized across devices when synchronizing user-data
             * like configuration, extensions, and mementos.
             *
             * Note that this function defines the whole set of keys whose values are synchronized:
             *  - calling it with an empty array stops synchronization for this memento
             *  - calling it with a non-empty array replaces all keys whose values are synchronized
             *
             * For any given set of keys this function needs to be called only once but there is no harm in
             * repeatedly calling it.
             *
             * @param keys The set of keys whose values are synced.
             */
            setKeysForSync(keys: readonly string[]): void
        }

        /**
         * The current `Extension` instance.
         */
        readonly extension: Extension<any>
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
