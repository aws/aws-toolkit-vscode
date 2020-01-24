/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ResourceFetcher {
    /**
     * Returns the contents of the resource, or undefined if the resource could not be retrieved.
     * Implementations are expected to handle Errors.
     */
    get(): Promise<string | undefined>
}
