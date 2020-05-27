// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import software.aws.toolkits.core.utils.test.aString

fun aToolkitCredentialsIdentifier(
    id: String = aString(),
    displayName: String = aString(),
    factoryId: String = aString(),
    defaultRegionId: String? = null
) = object :
    ToolkitCredentialsIdentifier() {
    override val id: String = id
    override val displayName: String = displayName
    override val factoryId: String = factoryId
    override val defaultRegionId: String? = defaultRegionId
}
