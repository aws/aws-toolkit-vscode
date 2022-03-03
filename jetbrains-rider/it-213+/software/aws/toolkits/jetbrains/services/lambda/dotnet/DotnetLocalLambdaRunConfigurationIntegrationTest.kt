// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import software.aws.toolkits.core.lambda.LambdaRuntime

class Dotnet60LocalLambdaRunConfigurationIntegrationTest : DotnetLocalLambdaRunConfigurationIntegrationTestBase("EchoLambda6X", LambdaRuntime.DOTNET6_0)

class Dotnet60LocalLambdaImageRunConfigurationIntegrationTest :
    DotnetLocalLambdaImageRunConfigurationIntegrationTestBase("ImageLambda6X", LambdaRuntime.DOTNET6_0)
