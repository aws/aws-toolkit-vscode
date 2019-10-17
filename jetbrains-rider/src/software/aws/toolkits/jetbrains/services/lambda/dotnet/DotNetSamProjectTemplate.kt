// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.TemplateParameters
import software.aws.toolkits.jetbrains.services.lambda.TemplateParameters.AppBasedTemplate
import software.aws.toolkits.resources.message

class DotNetSamProjectTemplate : SamProjectTemplate() {
    override fun getName(): String = message("sam.init.template.hello_world.name")

    override fun getDescription(): String? = message("sam.init.template.hello_world.description")

    override fun supportedRuntimes(): Set<Runtime> = setOf(Runtime.DOTNETCORE2_0, Runtime.DOTNETCORE2_1)

    override fun templateParameters(): TemplateParameters = AppBasedTemplate("hello-world", "cli-package")
}
