// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppFactory

class FeatureDevAppFactory : AmazonQAppFactory {
    override fun createApp(project: Project) = FeatureDevApp()
}
