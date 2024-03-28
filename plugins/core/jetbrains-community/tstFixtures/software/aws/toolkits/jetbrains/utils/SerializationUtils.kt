// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.configurationStore.deserializeAndLoadState
import com.intellij.configurationStore.serializeStateInto
import com.intellij.openapi.components.PersistentStateComponent
import org.intellij.lang.annotations.Language
import org.jdom.Element
import org.jdom.input.SAXBuilder
import org.jdom.output.XMLOutputter
import java.io.ByteArrayInputStream

fun xmlElement(@Language("XML") str: String): Element {
    val stream = ByteArrayInputStream(str.toByteArray())
    val builder = SAXBuilder()
    return builder.build(stream).rootElement
}

fun serializeState(rootTag: String, state: PersistentStateComponent<*>): String {
    val element = Element(rootTag)
    serializeStateInto(state, element)
    return XMLOutputter().outputString(element)
}

fun deserializeState(@Language("XML") str: String, state: PersistentStateComponent<*>) {
    deserializeAndLoadState(state, xmlElement(str))
}
