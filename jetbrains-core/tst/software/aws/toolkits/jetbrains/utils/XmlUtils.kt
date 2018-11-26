// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.jdom.Element
import org.jdom.input.SAXBuilder
import java.io.ByteArrayInputStream

fun String.toElement(): Element {
    val stream = ByteArrayInputStream(this.toByteArray())
    val builder = SAXBuilder()
    return builder.build(stream).rootElement
}
