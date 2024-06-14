// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

/**
 * Used to provide a way to cache an identity ID in order to prevent creating additional unneeded identities.
 */
interface CachedIdentityStorage {
    /**
     * Saves the identity ID to the backing storage.
     *
     * @param identityPoolId The pool the identity belongs to
     * @param identityId The generated ID
     */
    fun storeIdentity(identityPoolId: String, identityId: String)

    /**
     * Attempts to retrieve the identity ID from the backing storage. If no ID exists for the specified pool,
     * `null` should be returned in order to generate a new ID.
     *
     * @param identityPoolId The ID of the pool we are requested the ID for
     * @return The ID for the specified pool, else null
     */
    fun loadIdentity(identityPoolId: String): String?
}
