// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.CommonContainerFixture
import com.intellij.remoterobot.fixtures.ContainerFixture
import com.intellij.remoterobot.fixtures.FixtureName
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.step
import java.time.Duration

fun ContainerFixture.dialog(
    title: String,
    timeout: Duration = Duration.ofSeconds(20),
    function: DialogFixture.() -> Unit = {}
) {
    step("Search for dialog with title $title") {
        val dialog = find<DialogFixture>(DialogFixture.byTitle(title), timeout)

        dialog.apply(function)

        if (dialog.isShowing) {
            dialog.close()
        }

        dialog
    }
}

@FixtureName("Dialog")
open class DialogFixture(
    remoteRobot: RemoteRobot,
    remoteComponent: RemoteComponent
) : CommonContainerFixture(remoteRobot, remoteComponent) {
    companion object {
        fun byTitle(title: String) = byXpath("title $title", "//div[@title='$title' and @class='MyDialog']")
        fun byTitleContains(partial: String) = byXpath("partial title '$partial'", "//div[contains(@accessiblename, '$partial') and @class='MyDialog']")
    }

    val title: String
        get() = callJs("component.getTitle();")

    fun close() {
        runJs("robot.close(component)")
    }

    open fun pressOk() {
        pressButton("OK")
    }

    fun pressCancel() {
        pressButton("Cancel")
    }

    fun pressButton(text: String) {
        button(text).click()
    }
}
