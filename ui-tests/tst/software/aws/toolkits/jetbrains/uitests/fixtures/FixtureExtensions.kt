// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.fixtures.CommonContainerFixture
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.ContainerFixture
import com.intellij.remoterobot.fixtures.JTextAreaFixture
import com.intellij.remoterobot.fixtures.JTextFieldFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.keyboard
import java.time.Duration

fun ComponentFixture.rightClick() = step("Right click") {
    runJs("robot.rightClick(component);")
}

fun ContainerFixture.pressOk() = findAndClick("//div[@text='OK']")
fun ContainerFixture.pressDelete() = findAndClick("//div[@text='Delete']")
fun ContainerFixture.pressCancel() = findAndClick("//div[@text='Cancel']")

fun ContainerFixture.findAndClick(xPath: String) = findByXpath(xPath).click()
fun ContainerFixture.findByXpath(xPath: String) = find<ComponentFixture>(byXpath(xPath), Duration.ofSeconds(5))

fun ContainerFixture.fillSingleTextField(text: String) = step("Fill single text field with $text") {
    find<JTextFieldFixture>(byXpath("//div[@class='JTextField']"), Duration.ofSeconds(5)).text = text
}

// There is no function to write text to this directly :(
fun ContainerFixture.fillSingleJBTextArea(text: String) = step("Fill single JBTextArea with $text") {
    find<JTextAreaFixture>(byXpath("//div[@class='JBTextArea']")).click()
    keyboard { this.enterText(text) }
}

fun ContainerFixture.fillAllJBTextFields(text: String) = step("Fill all visible text fields with $text") {
    findAll(JTextFieldFixture::class.java, byXpath("//div[@class='JBTextField']")).forEach { it.text = text }
}

fun ContainerFixture.pressCreate() = step("Press the \"Create\" button") {
    find<ComponentFixture>(byXpath("//div[@text='Create']")).click()
}

fun ContainerFixture.pressSave() = step("""Press the "Save" button""") {
    find<ComponentFixture>(byXpath("//div[@text='Save']")).click()
}

fun ContainerFixture.pressYes() = step("""Press the visible "yes" button""") {
    findAndClick("//div[@class='JButton' and @text='Yes']")
}

/*
 * Find an action button by button text instead of by xPath
 */
fun CommonContainerFixture.actionButton(buttonText: String) = actionButton(byXpath("//div[@accessiblename='$buttonText' and @class='ActionButton']"))
