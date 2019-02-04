/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

export interface CredentialsFileReaderProcessor {
    // returns the list of available profile names
    getProfileNames(): Promise<string[]>

    /**
     * Gets the default region for a credentials profile
     *
     * @param profileName Profile to get the default region from
     * @returns Default region, undefined if region is not set
     */
    getDefaultRegion(profileName: string): Promise<string | undefined>
}

export interface Profile {
    [key: string]: string | undefined
}

export interface ParsedIniData {
    [key: string]: Profile
}
