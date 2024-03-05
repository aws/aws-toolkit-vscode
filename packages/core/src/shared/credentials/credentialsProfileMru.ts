/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Tracks the credentials selected by the user, ordered by most recent.
 */
export class CredentialsProfileMru {
    public static readonly maxCredentialMruSize = 5

    private static readonly configurationStateName: string = 'recentCredentials'

    public constructor(private readonly _context: vscode.ExtensionContext) {}

    /**
     * @description Returns the most recently used credentials names
     */
    public getMruList(): string[] {
        return this._context.globalState.get<string[]>(CredentialsProfileMru.configurationStateName, [])
    }

    /**
     * @description Places a credential at the top of the MRU list
     * @param profileName The credentials most recently used
     */
    public async setMostRecentlyUsedProfile(profileName: string): Promise<void> {
        const mru: string[] = this.getMruList()

        const currentIndex = mru.indexOf(profileName)
        if (currentIndex !== -1) {
            mru.splice(currentIndex, 1)
        }

        mru.splice(0, 0, profileName)

        mru.splice(CredentialsProfileMru.maxCredentialMruSize)

        await this._context.globalState.update(CredentialsProfileMru.configurationStateName, mru)
    }
}
