// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import software.aws.toolkits.core.lambda.LambdaArchitecture
import software.aws.toolkits.core.lambda.LambdaRuntime

sealed class TemplateParameters

data class AppBasedZipTemplate(
    val name: String,
    val runtime: LambdaRuntime,
    val architecture: LambdaArchitecture,
    val appTemplate: String,
    val dependencyManager: String
) : TemplateParameters()
data class AppBasedImageTemplate(
    val name: String,
    val baseImage: String,
    val architecture: LambdaArchitecture,
    val appTemplate: String,
    val dependencyManager: String
) : TemplateParameters()
data class LocationBasedTemplate(val location: String) : TemplateParameters()
