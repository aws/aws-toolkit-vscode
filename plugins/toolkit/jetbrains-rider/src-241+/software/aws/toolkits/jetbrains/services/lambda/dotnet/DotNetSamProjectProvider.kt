// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.jetbrains.rd.util.lifetime.Lifetime
import com.jetbrains.rd.util.reactive.IProperty
import com.jetbrains.rd.util.reactive.Property
import com.jetbrains.rider.projectView.projectTemplates.NewProjectDialogContext
import com.jetbrains.rider.projectView.projectTemplates.ProjectTemplatesSharedModel
import com.jetbrains.rider.projectView.projectTemplates.generators.ProjectTemplateGenerator
import com.jetbrains.rider.projectView.projectTemplates.providers.ProjectTemplateProvider
import com.jetbrains.rider.projectView.projectTemplates.templateTypes.ProjectTemplateType
import icons.AwsIcons
import software.aws.toolkits.resources.message

class DotNetSamProjectProvider : ProjectTemplateProvider {

    override val isReady = Property(true)

    override fun load(lifetime: Lifetime, context: NewProjectDialogContext): IProperty<Set<ProjectTemplateType>?> =
        Property(setOf(RiderSamProject()))

    private class RiderSamProject : ProjectTemplateType {
        override val group = message("sam.init.group.name")
        override val icon = AwsIcons.Resources.SERVERLESS_APP
        override val name = message("sam.init.name")
        override val order = 90

        override fun createGenerator(lifetime: Lifetime, context: NewProjectDialogContext, sharedModel: ProjectTemplatesSharedModel): ProjectTemplateGenerator =
            DotNetSamProjectGenerator(lifetime, context, sharedModel)

        override fun getKeywords() = setOf(name)
    }
}
