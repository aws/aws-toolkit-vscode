// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.jetbrains.rd.util.lifetime.Lifetime
import com.jetbrains.rd.util.reactive.IOptProperty
import com.jetbrains.rd.util.reactive.OptProperty
import com.jetbrains.rd.util.reactive.Property
import com.jetbrains.rider.projectView.actions.projectTemplating.RiderProjectTemplate
import com.jetbrains.rider.projectView.actions.projectTemplating.RiderProjectTemplateGenerator
import com.jetbrains.rider.projectView.actions.projectTemplating.RiderProjectTemplateProvider
import com.jetbrains.rider.projectView.actions.projectTemplating.RiderProjectTemplateState
import com.jetbrains.rider.projectView.actions.projectTemplating.impl.ProjectTemplateDialogContext
import com.jetbrains.rider.projectView.actions.projectTemplating.impl.ProjectTemplateTransferableModel
import icons.AwsIcons
import software.aws.toolkits.resources.message

class DotNetSamProjectProvider : RiderProjectTemplateProvider {

    override val isReady = Property(true)

    override fun load(lifetime: Lifetime, context: ProjectTemplateDialogContext): IOptProperty<RiderProjectTemplateState> {
        val state = RiderProjectTemplateState(arrayListOf(), arrayListOf())

        state.new.add(RiderSamProject())
        return OptProperty(state)
    }

    private class RiderSamProject : RiderProjectTemplate {

        override val group = "AWS"
        override val icon = AwsIcons.Resources.SERVERLESS_APP
        override val name = message("sam.init.name")

        override fun createGenerator(
            context: ProjectTemplateDialogContext,
            transferableModel: ProjectTemplateTransferableModel
        ): RiderProjectTemplateGenerator =
            DotNetSamProjectGenerator(
                context = context,
                group = group,
                categoryName = name,
                model = transferableModel
            )

        override fun getKeywords(): Array<String> = arrayOf(name)
    }
}
