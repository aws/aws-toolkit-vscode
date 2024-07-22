/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../extensionGlobals'

/**
 * Tracks the credentials selected by the user, ordered by most recent.
 */
export class CredentialsProfileMru {
    public static readonly maxCredentialMruSize = 5

    public constructor() {}

    /**
     * @description Returns the most recently used credentials names
     */
    public getMruList(): string[] {
        return globals.globalState.tryGet<string[]>('recentCredentials', Object, [])
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

        await globals.globalState.update('recentCredentials', mru)
    }
}
