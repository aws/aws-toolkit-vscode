// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.CommonContainerFixture
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.FixtureName
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.step
import java.time.Duration

fun IdeaFrame.awsExplorer(
    timeout: Duration = Duration.ofSeconds(20),
    function: AwsExplorer.() -> Unit
) {
    val locator = byXpath("//div[@accessiblename='AWS Toolkit Tool Window']")

    step("AWS toolkit tool window") {
        val explorer = try {
            find<AwsExplorer>(locator)
        } catch (e: Exception) {
            step("Open tool window") {
                // Click the tool window stripe
                find(ComponentFixture::class.java, byXpath("//div[@accessiblename='AWS Toolkit' and @class='StripeButton' and @text='AWS Toolkit']")).click()
                find(locator, timeout)
            }
        }

        explorer.apply(function)
    }
}

@FixtureName("AWSExplorer")
open class AwsExplorer(
    remoteRobot: RemoteRobot,
    remoteComponent: RemoteComponent
) : CommonContainerFixture(remoteRobot, remoteComponent) {
    fun explorerTree() = find<JTreeFixture>(byXpath("//div[@class='Tree']"), timeout = Duration.ofSeconds(5)).also { it.waitUntilLoaded() }

    fun openExplorerActionMenu(vararg path: String) {
        explorerTree().rightClickPath(*path)
    }

    fun expandExplorerNode(vararg path: String) {
        explorerTree().expand(*path)
        explorerTree().waitUntilLoaded()
    }

    fun doubleClickExplorer(vararg nodeElements: String) {
        explorerTree().doubleClickPath(*nodeElements)
    }
}
