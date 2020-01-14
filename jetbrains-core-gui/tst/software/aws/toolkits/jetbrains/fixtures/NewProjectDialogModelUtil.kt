// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.fixtures

import com.intellij.testGuiFramework.impl.button
import com.intellij.testGuiFramework.impl.combobox
import com.intellij.testGuiFramework.impl.jList
import com.intellij.testGuiFramework.util.scenarios.NewProjectDialogModel
import com.intellij.testGuiFramework.util.scenarios.NewProjectDialogModel.Constants.buttonFinish
import com.intellij.testGuiFramework.util.scenarios.NewProjectDialogModel.Constants.buttonNext
import com.intellij.testGuiFramework.util.scenarios.assertProjectPathExists
import com.intellij.testGuiFramework.util.scenarios.connectDialog
import com.intellij.testGuiFramework.util.scenarios.fileSystemUtils
import com.intellij.testGuiFramework.util.scenarios.selectProjectGroup
import com.intellij.testGuiFramework.util.scenarios.selectSdk
import com.intellij.testGuiFramework.util.scenarios.typeProjectNameAndLocation
import com.intellij.testGuiFramework.util.scenarios.waitLoadingTemplates
import com.intellij.testGuiFramework.util.step
import java.util.Arrays
import kotlin.test.assertNotNull

private const val AWS_GROUP = "AWS"

data class ServerlessProjectOptions(val runtime: String, val template: String)

fun NewProjectDialogModel.createServerlessProject(
    projectPath: String,
    templateOptions: ServerlessProjectOptions,
    sdkRegex: Regex
) {
    with(guiTestCase) {
        fileSystemUtils.assertProjectPathExists(projectPath)

        with(connectDialog()) {
            step("select '$AWS_GROUP' project group") {
                waitLoadingTemplates()

                val list = jList(AWS_GROUP)
                step("click '$AWS_GROUP'") { list.clickItem(AWS_GROUP) }
                list.requireSelection(AWS_GROUP)
            }

            val projectType = "AWS Serverless Application"
            step("select project type '$projectType'") {
                jList(projectType).clickItem(projectType)
            }

            step("setup '$projectType'") {
                button(buttonNext).click()

                typeProjectNameAndLocation(projectPath)

                step("select runtime '${templateOptions.runtime}'") {
                    combobox("Runtime:").selectItem(templateOptions.runtime)
                }

                step("select template '${templateOptions.template}'") {
                    combobox("SAM Template:").selectItem(templateOptions.template)
                }

                val sdkCandidates = sdkChooser().contents()
                val sdkChoice = sdkCandidates.firstOrNull { it.matches(sdkRegex) }
                assertNotNull(sdkChoice, "No valid SDK found, choices are: ${Arrays.toString(sdkCandidates)}")
                selectSdk(sdkChoice)

                step("close New Project dialog with Finish") {
                    button(buttonFinish).click()
                    waitTillGone()
                }
            }
        }
    }
}

fun NewProjectDialogModel.createEmptyProject(projectPath: String) {
    with(connectDialog()) {
        selectProjectGroup(NewProjectDialogModel.Groups.Empty)
        button(buttonNext).click()
        typeProjectNameAndLocation(projectPath)
        button(buttonFinish).click()
    }

    with(guiTestCase) {
        ideFrame {
            waitForBackgroundTasksToFinish()
            dialog("Project Structure") {
                button(NewProjectDialogModel.Constants.buttonCancel).click()
            }
        }
    }
}
