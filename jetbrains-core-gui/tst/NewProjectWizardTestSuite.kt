// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.intellij.testGuiFramework.framework.GuiTestSuite
import com.intellij.testGuiFramework.framework.RunWithIde
import com.intellij.testGuiFramework.launcher.ide.CommunityIde
import org.junit.runner.RunWith
import org.junit.runners.Suite
import software.aws.toolkits.jetbrains.settings.SetSamCli
import software.aws.toolkits.jetbrains.ui.s3.S3BrowserTest
import software.aws.toolkits.jetbrains.ui.wizard.SamInitProjectBuilderIntelliJTest

@RunWith(Suite::class)
@RunWithIde(CommunityIde::class)
@Suite.SuiteClasses(S3BrowserTest::class, SetSamCli::class, SamInitProjectBuilderIntelliJTest::class)
class NewProjectWizardTestSuite : GuiTestSuite()
