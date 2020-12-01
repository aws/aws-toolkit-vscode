// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.wizard.SamAppTemplateBased
import software.aws.toolkits.resources.message

class DotNetSamProjectTemplate : SamAppTemplateBased() {
    override fun displayName(): String = message("sam.init.template.hello_world.name")

    override val dependencyManager: String = "cli-package"

    override val appTemplateName: String = "hello-world"

    override fun description(): String = message("sam.init.template.hello_world.description")

    override fun supportedRuntimes(): Set<Runtime> = setOf(Runtime.DOTNETCORE2_1, Runtime.DOTNETCORE3_1)

    override fun supportedPackagingTypes(): Set<PackageType> = setOf(PackageType.IMAGE, PackageType.ZIP)
}
