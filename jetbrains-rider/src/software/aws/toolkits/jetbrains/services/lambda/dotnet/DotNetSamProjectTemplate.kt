// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.wizard.AppBasedTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.wizard.TemplateParameters
import software.aws.toolkits.resources.message

class DotNetSamProjectTemplate : SamProjectTemplate() {
    override fun displayName(): String = message("sam.init.template.hello_world.name")

    override fun description(): String? = message("sam.init.template.hello_world.description")

    override fun supportedRuntimes(): Set<Runtime> = setOf(Runtime.DOTNETCORE2_1, Runtime.DOTNETCORE3_1)

    override fun templateParameters(projectName: String, runtime: Runtime): TemplateParameters = AppBasedTemplate(
        projectName,
        runtime,
        "hello-world",
        "cli-package"
    )
}
