// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.fixtures.CommonContainerFixture
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.ContainerFixture
import com.intellij.remoterobot.fixtures.JTextFieldFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.step
import org.intellij.lang.annotations.Language
import java.time.Duration

fun ComponentFixture.rightClick() = step("Right click") {
    runJs("robot.rightClick(component);")
}

fun ContainerFixture.pressOk() = findAndClick("//div[@text='OK']")
fun ContainerFixture.pressDelete() = findAndClick("//div[@text='Delete']")
fun ContainerFixture.pressCancel() = findAndClick("//div[@text='Cancel']")
fun ContainerFixture.pressClose() = findAndClick("//div[@text='Close']")

fun ContainerFixture.findAndClick(@Language("XPath") xPath: String) = findByXpath(xPath).click()
fun ContainerFixture.findByXpath(@Language("XPath") xPath: String) = find<ComponentFixture>(byXpath(xPath), Duration.ofSeconds(5))

fun ContainerFixture.fillSingleTextField(text: String) = step("Fill single text field with $text") {
    find<JTextFieldFixture>(byXpath("//div[@class='JTextField']"), Duration.ofSeconds(5)).text = text
}

/*
 * Find an action button by button text instead of by xPath
 */
fun CommonContainerFixture.actionButton(buttonText: String) = actionButton(byXpath("//div[@accessiblename='$buttonText' and @class='ActionButton']"))
