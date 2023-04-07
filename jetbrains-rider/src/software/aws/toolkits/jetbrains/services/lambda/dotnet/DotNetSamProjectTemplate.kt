// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamAppTemplateBased
import software.aws.toolkits.resources.message

class DotNetSamProjectTemplate : SamAppTemplateBased() {
    override fun displayName(): String = message("sam.init.template.hello_world.name")

    override val dependencyManager: String = "cli-package"

    override val appTemplateName: String = "hello-world"

    override fun description(): String = message("sam.init.template.hello_world.description")

    override fun supportedZipRuntimes(): Set<LambdaRuntime> = setOf(LambdaRuntime.DOTNET6_0)
    override fun supportedImageRuntimes(): Set<LambdaRuntime> = setOf(LambdaRuntime.DOTNET5_0, LambdaRuntime.DOTNET6_0)
}
