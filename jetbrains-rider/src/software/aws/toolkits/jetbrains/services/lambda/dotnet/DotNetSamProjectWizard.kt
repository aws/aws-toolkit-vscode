// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import software.aws.toolkits.jetbrains.services.lambda.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.SamProjectWizard
import software.aws.toolkits.jetbrains.ui.wizard.NoOpSchemaSelectionPanel
import software.aws.toolkits.jetbrains.ui.wizard.NoOpSdkSelectionPanel
import software.aws.toolkits.jetbrains.ui.wizard.SamProjectGenerator
import software.aws.toolkits.jetbrains.ui.wizard.SchemaSelectionPanel
import software.aws.toolkits.jetbrains.ui.wizard.SdkSelectionPanel

class DotNetSamProjectWizard : SamProjectWizard {
    override fun listTemplates(): Collection<SamProjectTemplate> =
        listOf(DotNetSamProjectTemplate())

    override fun createSdkSelectionPanel(generator: SamProjectGenerator): SdkSelectionPanel =
        NoOpSdkSelectionPanel()

    override fun createSchemaSelectionPanel(generator: SamProjectGenerator): SchemaSelectionPanel =
        NoOpSchemaSelectionPanel()
}
