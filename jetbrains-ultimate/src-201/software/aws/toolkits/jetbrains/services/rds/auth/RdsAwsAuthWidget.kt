// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.rds.auth

import software.aws.toolkits.jetbrains.services.rds.RdsResources
import software.aws.toolkits.jetbrains.ui.AwsAuthWidget

class RdsAwsAuthWidget : AwsAuthWidget() {
    override fun getRegionFromUrl(url: String?): String? = RdsResources.extractRegionFromUrl(url)
}
