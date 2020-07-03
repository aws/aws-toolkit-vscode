// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.FixtureName
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.step
import java.time.Duration

fun RemoteRobot.newProjectWizard(
    timeout: Duration = Duration.ofSeconds(20),
    function: NewProjectWizardDialog.() -> Unit
) {
    step("Search for new project wizard dialog") {
        val dialog = find<NewProjectWizardDialog>(DialogFixture.byTitle("New Project"), timeout)

        dialog.apply(function)

        if (dialog.isShowing) {
            dialog.close()
        }
    }
}

@FixtureName("New Project Wizard")
open class NewProjectWizardDialog(
    remoteRobot: RemoteRobot,
    remoteComponent: RemoteComponent
) : DialogFixture(remoteRobot, remoteComponent) {
    fun selectProjectCategory(type: String) {
        findText(type).click()
    }

    fun selectProjectType(type: String) {
        jList(byXpath("//div[@class='JBList' and @visible_text='$type']")).click()
    }

    fun setProjectLocation(folder: String) {
        textField("Project location:").text = folder
    }

    fun pressNext() {
        pressButton("Next")
    }

    fun pressFinish() {
        pressButton("Finish")
    }
}
