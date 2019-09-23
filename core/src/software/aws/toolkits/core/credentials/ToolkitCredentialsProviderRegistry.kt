// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

/**
 * Registry of all possible [ToolkitCredentialsProviderFactory]
 */
interface ToolkitCredentialsProviderRegistry {
    fun listFactories(manager: ToolkitCredentialsProviderManager): Collection<ToolkitCredentialsProviderFactory<*>>
}
