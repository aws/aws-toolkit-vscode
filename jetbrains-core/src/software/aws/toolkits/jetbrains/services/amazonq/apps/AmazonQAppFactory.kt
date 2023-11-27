// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.apps

import com.intellij.openapi.project.Project

interface AmazonQAppFactory {
    fun createApp(project: Project): AmazonQApp
}
