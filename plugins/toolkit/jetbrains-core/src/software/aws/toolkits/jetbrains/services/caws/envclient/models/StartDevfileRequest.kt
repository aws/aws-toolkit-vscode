// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws.envclient.models

data class StartDevfileRequest(
    val location: String? = null,
    val recreateHomeVolumes: Boolean? = null
)
