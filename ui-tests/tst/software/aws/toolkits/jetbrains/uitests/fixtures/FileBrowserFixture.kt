// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.ContainerFixture
import com.intellij.remoterobot.fixtures.FixtureName
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.keyboard
import java.nio.file.Path
import java.time.Duration

fun ContainerFixture.fileBrowser(
    partialTitle: String,
    timeout: Duration = Duration.ofSeconds(20),
    function: FileBrowserFixture.() -> Unit = {}
) {
    step("Search for file explorer with title matching $partialTitle") {
        val dialog = find<FileBrowserFixture>(DialogFixture.byTitleContains(partialTitle), timeout)

        dialog.apply(function)

        if (dialog.isShowing) {
            dialog.close()
        }

        dialog
    }
}

@FixtureName("FileBrowser")
class FileBrowserFixture(
    remoteRobot: RemoteRobot,
    remoteComponent: RemoteComponent
) : DialogFixture(remoteRobot, remoteComponent) {
    fun selectFile(path: Path) = step("Select ${path.toAbsolutePath()}") {
        // Wait for file explorer to load
        Thread.sleep(1000)
        step("Fill file explorer with ${path.toAbsolutePath()}") {
            keyboard { enterText(path.toAbsolutePath().toString(), delayBetweenCharsInMs = 0) } // path text box is already focused on open
        }
        val file = path.fileName.toString()
        step("Refresh file explorer to make sure the file $file is loaded") {
            findAndClick("//div[@accessiblename='Refresh']")
        }
        pressOk()
    }
}
