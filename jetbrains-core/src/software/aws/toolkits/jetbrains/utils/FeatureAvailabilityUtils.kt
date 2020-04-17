// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

private const val CLASSIC_PARTITION = "aws"

private fun availableInClassic(activeRegion: AwsRegion): Boolean = activeRegion.partitionId == CLASSIC_PARTITION

// technically available in govcloud but the api/console is broken
fun lambdaTracingConfigIsAvailable(activeRegion: AwsRegion) = availableInClassic(activeRegion) &&
    AwsRegionProvider.getInstance().isServiceSupported(activeRegion, "xray")

fun cloudDebugIsAvailable(activeRegion: AwsRegion) = availableInClassic(activeRegion)
